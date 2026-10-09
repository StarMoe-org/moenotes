// Deck solver Worker core, protocol moenotes.deck-worker/1 (docs/deck-worker.md). The Worker shell
// (deck-worker.js) passes `post`; downloads, hashing, the clock and the solver loader are injectable, so the same
// code runs in tests.

export const DECK_WORKER_PROTOCOL = 'moenotes.deck-worker/1';

const HEX64 = /^[0-9a-f]{64}$/;

class Failure extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const describe = error => (error instanceof Error ? error.message : String(error));
const hex = buffer => Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('');
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const DIFFICULTIES = [['easy', '_easyID'], ['normal', '_normalID'], ['hard', '_hardID'], ['expert', '_expertID']];

/** A small availability view of the verified data. The solver still receives the original bytes. */
function dataCatalog(data) {
  function rows(name) {
    const table = data?.master?.[name];
    if (!record(table) || !Array.isArray(table.columns) || !Array.isArray(table.rows)
      || table.columns.some(column => typeof column !== 'string') || new Set(table.columns).size !== table.columns.length) return [];
    const byId = new Map();
    for (const row of table.rows) {
      if (!Array.isArray(row) || row.length !== table.columns.length) continue;
      const value = Object.fromEntries(table.columns.map((column, index) => [column, row[index]]));
      if (!positiveId(value._id)) continue;
      byId.set(value._id, byId.has(value._id) ? null : value);
    }
    return [...byId.values()].filter(value => value !== null).sort((a, b) => a._id - b._id);
  }
  const scoreIds = new Set(Array.isArray(data?.charts) ? data.charts.filter(chart => record(chart) && positiveId(chart.scoreId)).map(chart => chart.scoreId) : []);
  return {
    eventIds: rows('MasterEvent').map(row => row._id),
    musics: rows('MasterLiveMusic').map(row => ({ id: row._id,
      difficulties: DIFFICULTIES.filter(([, column]) => positiveId(row[column]) && scoreIds.has(row[column])).map(([difficulty]) => difficulty) })),
    challengeMusics: rows('MasterChallengeMusic').filter(row => positiveId(row._eventId) && positiveId(row._liveMusicId))
      .map(row => ({ id: row._id, eventId: row._eventId, musicId: row._liveMusicId })),
    arenaMusics: rows('MasterArenaMusic').filter(row => positiveId(row._liveMusicId))
      .map(row => ({ id: row._id, musicId: row._liveMusicId })),
  };
}

/**
 * Load wasm-bindgen `--target web` glue from its verified bytes: import it as an ES module from a blob URL, then
 * instantiate the verified WASM bytes with its default export. Resolves to the `DeckSolver` class.
 */
export async function loadDeckSolverModule({ glue, wasm }) {
  const url = URL.createObjectURL(new Blob([glue], { type: 'text/javascript' }));
  let module;
  try { module = await import(url); }
  finally { URL.revokeObjectURL(url); }
  if (typeof module.default !== 'function') throw new Error('The engine glue has no default init export');
  await module.default({ module_or_path: wasm });
  if (typeof module.DeckSolver !== 'function') throw new Error('The engine glue exports no DeckSolver');
  return module.DeckSolver;
}

const FILES = [['deckData', 'deck data'], ['wasm', 'engine WASM'], ['glue', 'engine glue']];

function invalidInit(message) {
  if (message.protocol !== DECK_WORKER_PROTOCOL) return 'Unsupported protocol ' + String(message.protocol);
  for (const [name] of FILES) {
    const url = message[name + 'Url'], sha256 = message[name + 'Sha256'], bytes = message[name + 'Bytes'];
    if (typeof url !== 'string' || !url || typeof sha256 !== 'string' || !HEX64.test(sha256) || !Number.isSafeInteger(bytes) || bytes < 1) return 'Invalid ' + name + ' file';
  }
  if (message.modelCommit !== null && (typeof message.modelCommit !== 'string' || !message.modelCommit)) return 'Invalid modelCommit';
  return null;
}

function invalidRun(message) {
  if (typeof message.jobId !== 'string' || !message.jobId || !Number.isSafeInteger(message.inputRevision)) return 'Invalid job binding';
  if (typeof message.accountJson !== 'string' || typeof message.requestJson !== 'string') return 'Solver input must be JSON text';
  if (typeof message.progressIntervalMs !== 'number' || !Number.isFinite(message.progressIntervalMs) || message.progressIntervalMs < 0) return 'Invalid progressIntervalMs';
  return null;
}

/**
 * @param {{
 *   post: (message: object) => void,
 *   fetch?: (url: string) => Promise<Response>,
 *   digest?: (bytes: ArrayBuffer) => Promise<ArrayBuffer>,
 *   now?: () => number,
 *   loadSolver?: (files: { glue: ArrayBuffer, wasm: ArrayBuffer }) => Promise<Function>,
 * }} platform
 */
export function createDeckWorkerCore({
  post,
  fetch = url => globalThis.fetch(url, { credentials: 'omit' }),
  digest = bytes => crypto.subtle.digest('SHA-256', bytes),
  now = () => performance.now(),
  loadSolver = loadDeckSolverModule,
}) {
  let queue = Promise.resolve();
  let initKey = null, solver = null, ready = null, failure = null, crashed = false;

  async function download(message, name, label) {
    const url = message[name + 'Url'];
    let body;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Failure('network', label + ': HTTP ' + response.status + ' ' + url);
      body = await response.arrayBuffer();
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw new Failure('network', label + ': ' + describe(error) + ' ' + url);
    }
    if (body.byteLength !== message[name + 'Bytes']) throw new Failure('integrity', label + ': ' + body.byteLength + ' bytes, expected ' + message[name + 'Bytes']);
    const sha256 = hex(await digest(body));
    if (sha256 !== message[name + 'Sha256']) throw new Failure('integrity', label + ': SHA-256 ' + sha256 + ', expected ' + message[name + 'Sha256']);
    return body;
  }

  function readDeckData(deckData) {
    try { return JSON.parse(new TextDecoder().decode(deckData)); }
    catch { throw new Failure('identity', 'The deck data is not JSON'); }
  }

  function checkModelCommit(data, expected) {
    const commit = data?.provenance?.deck?.commit;
    if (commit !== expected) throw new Failure('identity', 'The deck data names model ' + String(commit) + ', expected ' + expected);
  }

  function capabilities(created) {
    if (typeof created.capabilities !== 'function') return null;
    const value = created.capabilities();
    if (typeof value === 'string') return value;
    return value === undefined ? null : JSON.stringify(value);
  }

  async function initialize(message) {
    const problem = invalidInit(message);
    if (problem) { post({ type: 'failed', code: 'protocol', message: problem }); return; }
    const key = JSON.stringify([message.deckDataUrl, message.deckDataSha256, message.deckDataBytes, message.wasmUrl, message.wasmSha256,
      message.wasmBytes, message.glueUrl, message.glueSha256, message.glueBytes, message.modelCommit]);
    if (initKey !== null) {
      if (key !== initKey) post({ type: 'failed', code: 'protocol', message: 'This Worker is bound to another runtime' });
      else post(ready ?? failure);
      return;
    }
    initKey = key;
    const started = now();
    try {
      const [deckData, wasm, glue] = await Promise.all(FILES.map(([name, label]) => download(message, name, label)));
      const data = readDeckData(deckData);
      if (message.modelCommit !== null) checkModelCommit(data, message.modelCommit);
      const catalog = dataCatalog(data);
      let DeckSolver, created;
      try { DeckSolver = await loadSolver({ glue, wasm }); }
      catch (error) { throw new Failure('init', 'Engine: ' + describe(error)); }
      try { created = new DeckSolver(new Uint8Array(deckData)); }
      catch (error) { throw new Failure('init', 'DeckSolver: ' + describe(error)); }
      const datasetId = typeof created.datasetId === 'string' ? created.datasetId : '';
      if (datasetId !== message.deckDataSha256) {
        created.free?.();
        throw new Failure('integrity', 'The solver reports dataset ' + (datasetId || '(none)') + ', expected ' + message.deckDataSha256);
      }
      let capabilitiesJson;
      try { capabilitiesJson = capabilities(created); }
      catch (error) { created.free?.(); throw new Failure('init', 'DeckSolver.capabilities: ' + describe(error)); }
      solver = created;
      ready = { type: 'ready', datasetId, initMs: now() - started, capabilitiesJson, catalog };
      post(ready);
    } catch (error) {
      failure = { type: 'failed', code: error instanceof Failure ? error.code : 'init', message: describe(error) };
      post(failure);
    }
  }

  function run(message) {
    const problem = invalidRun(message);
    const binding = typeof message.jobId === 'string' && message.jobId ? { jobId: message.jobId, ...(Number.isSafeInteger(message.inputRevision) ? { inputRevision: message.inputRevision } : {}) } : {};
    if (problem) { post({ type: 'failed', ...binding, code: 'protocol', message: problem }); return; }
    const { jobId, inputRevision } = message;
    if (crashed) { post({ type: 'failed', ...binding, code: 'runtime', message: 'The solver stopped after an earlier crash' }); return; }
    if (!solver) {
      post({ type: 'failed', ...binding, code: failure ? failure.code : 'protocol', message: failure ? 'Initialization failed: ' + failure.message : 'The Worker is not initialized' });
      return;
    }
    let resultJson;
    try {
      // Synchronous: the solver calls back with complete results while it runs. A throw from here must not unwind
      // through the WASM frames, so posting is guarded.
      resultJson = solver.recommend(message.accountJson, message.requestJson, progressJson => {
        if (typeof progressJson !== 'string') return;
        try { post({ type: 'progress', jobId, inputRevision, resultJson: progressJson }); }
        catch { /* The page drops a Worker it can no longer reach. */ }
      }, message.progressIntervalMs);
    } catch (error) {
      crashed = true;
      post({ type: 'failed', ...binding, code: 'runtime', message: describe(error) });
      return;
    }
    if (typeof resultJson !== 'string') {
      crashed = true;
      post({ type: 'failed', ...binding, code: 'runtime', message: 'DeckSolver.recommend returned no result text' });
      return;
    }
    post({ type: 'result', jobId, inputRevision, resultJson });
  }

  async function dispatch(message) {
    if (!record(message)) { post({ type: 'failed', code: 'protocol', message: 'Not a message object' }); return; }
    if (message.type === 'init') return initialize(message);
    if (message.type === 'run') return run(message);
    post({ type: 'failed', code: 'protocol', message: 'Unknown message type ' + String(message.type) });
  }

  /** Messages are handled in arrival order; a run sent before `ready` waits for initialization. */
  function handle(message) {
    const task = queue.then(() => dispatch(message));
    queue = task.catch(() => undefined);
    return task;
  }

  return { handle };
}

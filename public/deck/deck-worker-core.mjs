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

/** LUCK presence in the three mission slots; null denotes incomplete mission data. */
function hasLuck(row) {
  const missions = [row._gekisouMission1, row._gekisouMission2, row._gekisouMission3];
  return missions.includes(2) ? true : missions.every(mission => mission === 1 || mission === 3) ? false : null;
}

/** A small availability view of the verified data. The solver still receives the original bytes. */
function dataCatalog(data) {
  function rows(name, required = []) {
    const table = data?.master?.[name];
    if (!record(table) || !Array.isArray(table.columns) || !Array.isArray(table.rows)
      || table.columns.some(column => typeof column !== 'string') || new Set(table.columns).size !== table.columns.length
      || required.some(column => !table.columns.includes(column))) return [];
    const byId = new Map();
    for (const row of table.rows) {
      if (!Array.isArray(row) || row.length !== table.columns.length) { if (required.length) return []; continue; }
      const value = Object.fromEntries(table.columns.map((column, index) => [column, row[index]]));
      if (!positiveId(value._id)) { if (required.length) return []; continue; }
      if (required.length && byId.has(value._id)) return [];
      byId.set(value._id, byId.has(value._id) ? null : value);
    }
    return [...byId.values()].filter(value => value !== null).sort((a, b) => a._id - b._id);
  }
  // Each grade must have exactly one guaranteed row across all resources in its event group.
  function rewardGroups(name) {
    const groups = new Map();
    for (const row of rows(name, ['_eventGroup', '_scoreRank', '_probability'])) {
      if (!positiveId(row._eventGroup)) continue;
      const group = groups.get(row._eventGroup) ?? { grades: new Set(), supported: true };
      group.supported &&= Number.isSafeInteger(row._scoreRank) && row._scoreRank >= 0
        && !group.grades.has(row._scoreRank) && row._probability === 10000;
      group.grades.add(row._scoreRank);
      groups.set(row._eventGroup, group);
    }
    return groups;
  }
  const normalRewards = rewardGroups('MasterLiveEventReward'), challengeRewards = rewardGroups('MasterChallengeLiveEventReward');
  const events = rows('MasterEvent');
  const scoreIds = new Set(Array.isArray(data?.charts) ? data.charts.filter(chart => record(chart) && positiveId(chart.scoreId)).map(chart => chart.scoreId) : []);
  return {
    eventIds: events.map(row => row._id),
    eventItemRewards: events.filter(row => positiveId(row._eventItemId)).map(row => ({
      id: row._id, itemId: row._eventItemId,
      normal: normalRewards.get(row._liveEventRewardGroup)?.supported === true,
      challenge: challengeRewards.get(row._challengeLiveEventRewardGroup)?.supported === true,
    })),
    musics: rows('MasterLiveMusic').map(row => ({ id: row._id, hasLuck: hasLuck(row),
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
const DECK_MASTER_OVERLAY_FORMAT = 'moenotes.deck-master-overlay/1';
const DECK_CHART_OVERLAY_FORMAT = 'moenotes.deck-chart-overlay/1';
const CHART_OVERLAY_BATCH_SIZE = 80;

function findMissingChartScoreIds(master, existingCharts) {
  if (!record(master)) return [];
  const scoreTable = master.MasterLiveMusicScore;
  const musicTable = master.MasterLiveMusic;
  if (!record(scoreTable) || !Array.isArray(scoreTable.columns) || !Array.isArray(scoreTable.rows)) return [];
  if (!record(musicTable) || !Array.isArray(musicTable.columns) || !Array.isArray(musicTable.rows)) return [];
  const scoreIdCol = scoreTable.columns.indexOf('_id');
  const fileNameCol = scoreTable.columns.indexOf('_musicScoreTextFileName');
  if (scoreIdCol < 0 || fileNameCol < 0) return [];

  const exportableScoreIds = new Set();
  for (const row of scoreTable.rows) {
    if (!Array.isArray(row) || row.length !== scoreTable.columns.length) continue;
    const id = row[scoreIdCol];
    const fileName = row[fileNameCol];
    if (positiveId(id) && typeof fileName === 'string' && fileName.trim().length > 0) {
      exportableScoreIds.add(id);
    }
  }
  if (exportableScoreIds.size === 0) return [];

  const existingScoreIds = new Set(
    Array.isArray(existingCharts)
      ? existingCharts.filter(chart => record(chart) && positiveId(chart.scoreId)).map(chart => chart.scoreId)
      : [],
  );
  const diffCols = DIFFICULTIES.map(([, col]) => musicTable.columns.indexOf(col)).filter(idx => idx >= 0);
  if (diffCols.length === 0) return [];

  const missing = new Set();
  for (const row of musicTable.rows) {
    if (!Array.isArray(row) || row.length !== musicTable.columns.length) continue;
    for (const colIdx of diffCols) {
      const scoreId = row[colIdx];
      if (positiveId(scoreId) && exportableScoreIds.has(scoreId) && !existingScoreIds.has(scoreId)) {
        missing.add(scoreId);
      }
    }
  }
  return [...missing].sort((a, b) => a - b);
}

function invalidInit(message) {
  if (message.protocol !== DECK_WORKER_PROTOCOL) return 'Unsupported protocol ' + String(message.protocol);
  for (const [name] of FILES) {
    const url = message[name + 'Url'], sha256 = message[name + 'Sha256'], bytes = message[name + 'Bytes'];
    if (typeof url !== 'string' || !url || typeof sha256 !== 'string' || !HEX64.test(sha256) || !Number.isSafeInteger(bytes) || bytes < 1) return 'Invalid ' + name + ' file';
  }
  if (message.modelCommit !== null && (typeof message.modelCommit !== 'string' || !message.modelCommit)) return 'Invalid modelCommit';
  if (message.masterOverlayUrl !== undefined && (typeof message.masterOverlayUrl !== 'string' || !message.masterOverlayUrl)) return 'Invalid masterOverlayUrl';
  if (message.chartsOverlayUrl !== undefined && (typeof message.chartsOverlayUrl !== 'string' || !message.chartsOverlayUrl)) return 'Invalid chartsOverlayUrl';
  return null;
}

function invalidRun(message) {
  if (typeof message.jobId !== 'string' || !message.jobId || !Number.isSafeInteger(message.inputRevision)) return 'Invalid job binding';
  if (typeof message.accountJson !== 'string' || typeof message.requestJson !== 'string') return 'Solver input must be JSON text';
  if (typeof message.progressIntervalMs !== 'number' || !Number.isFinite(message.progressIntervalMs) || message.progressIntervalMs < 0) return 'Invalid progressIntervalMs';
  if (message.seedJson !== undefined && typeof message.seedJson !== 'string') return 'Invalid continuation';
  return null;
}

function invalidGrowth(message) {
  if (typeof message.jobId !== 'string' || !message.jobId || !Number.isSafeInteger(message.inputRevision)) return 'Invalid job binding';
  if (typeof message.accountJson !== 'string' || typeof message.requestJson !== 'string' || typeof message.teamJson !== 'string') return 'Growth input must be JSON text';
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

  function resolveEndpointUrl(rawUrl, anchorUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl) return null;
    if (rawUrl.startsWith('/')) {
      if (typeof anchorUrl === 'string' && /^https?:\/\//i.test(anchorUrl)) {
        return new URL(rawUrl, anchorUrl).href;
      }
      if (typeof globalThis.location?.origin === 'string' && globalThis.location.origin !== 'null') {
        return new URL(rawUrl, globalThis.location.origin).href;
      }
    }
    return rawUrl;
  }

  async function downloadOverlay(rawUrl) {
    const url = resolveEndpointUrl(rawUrl, null);
    if (!url) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const parsed = await response.json();
      if (!record(parsed) || parsed.format !== DECK_MASTER_OVERLAY_FORMAT || !record(parsed.master)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async function downloadMissingCharts(rawBaseUrl, anchorUrl, missingScoreIds) {
    const baseUrl = resolveEndpointUrl(rawBaseUrl, anchorUrl);
    if (!baseUrl || !Array.isArray(missingScoreIds) || missingScoreIds.length === 0) {
      return { charts: [], musicLengthsMs: {} };
    }
    const charts = [];
    const musicLengthsMs = {};
    const seen = new Set();
    for (let offset = 0; offset < missingScoreIds.length; offset += CHART_OVERLAY_BATCH_SIZE) {
      const chunk = missingScoreIds.slice(offset, offset + CHART_OVERLAY_BATCH_SIZE);
      const separator = baseUrl.includes('?') ? '&' : '?';
      const url = baseUrl + separator + 'ids=' + chunk.join(',');
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const parsed = await response.json();
        if (!record(parsed) || parsed.format !== DECK_CHART_OVERLAY_FORMAT || !Array.isArray(parsed.charts)) continue;
        const lengths = record(parsed.musicLengthsMs) ? parsed.musicLengthsMs : {};
        for (const chart of parsed.charts) {
          if (!record(chart) || !positiveId(chart.scoreId) || seen.has(chart.scoreId)) continue;
          seen.add(chart.scoreId);
          charts.push(chart);
          const lengthVal = lengths[String(chart.scoreId)] ?? chart.durationMs;
          if (Number.isSafeInteger(lengthVal) && lengthVal > 0) {
            musicLengthsMs[String(chart.scoreId)] = lengthVal;
          }
        }
      } catch {
        // Ignore chart overlay batch transport failures; unavailable songs stay filtered out of catalog.musics.
      }
    }
    return { charts, musicLengthsMs };
  }

  async function tryCreateCandidateSolver(DeckSolver, candidateData) {
    try {
      const mergedBytes = new TextEncoder().encode(JSON.stringify(candidateData));
      const mergedSha256 = hex(await digest(mergedBytes.buffer));
      const candidate = new DeckSolver(mergedBytes, { datasetId: mergedSha256 });
      if (candidate && typeof candidate.datasetId === 'string' && candidate.datasetId === mergedSha256) {
        return { solver: candidate, datasetId: mergedSha256, data: candidateData };
      }
      candidate?.free?.();
    } catch {
      // Fall back cleanly if the engine rejects overlaid tables or hydrated charts.
    }
    return null;
  }

  async function initialize(message) {
    const problem = invalidInit(message);
    if (problem) { post({ type: 'failed', code: 'protocol', message: problem }); return; }
    const key = JSON.stringify([message.deckDataUrl, message.deckDataSha256, message.deckDataBytes, message.wasmUrl, message.wasmSha256,
      message.wasmBytes, message.glueUrl, message.glueSha256, message.glueBytes, message.modelCommit, message.masterOverlayUrl ?? null, message.chartsOverlayUrl ?? null]);
    if (initKey !== null) {
      if (key !== initKey) post({ type: 'failed', code: 'protocol', message: 'This Worker is bound to another runtime' });
      else post(ready ?? failure);
      return;
    }
    initKey = key;
    const started = now();
    try {
      const [[deckData, wasm, glue], overlay] = await Promise.all([
        Promise.all(FILES.map(([name, label]) => download(message, name, label))),
        downloadOverlay(message.masterOverlayUrl),
      ]);
      const data = readDeckData(deckData);
      if (message.modelCommit !== null) checkModelCommit(data, message.modelCommit);
      let DeckSolver;
      try { DeckSolver = await loadSolver({ glue, wasm }); }
      catch (error) { throw new Failure('init', 'Engine: ' + describe(error)); }

      const baseMaster = record(data.master) ? data.master : {};
      const mergedMaster = overlay ? { ...baseMaster, ...overlay.master } : baseMaster;
      const baseCharts = Array.isArray(data.charts) ? data.charts : [];
      const chartsOverlayUrl = message.chartsOverlayUrl ?? (record(overlay) && typeof overlay.chartsOverlayUrl === 'string' ? overlay.chartsOverlayUrl : undefined);
      const missingScoreIds = chartsOverlayUrl ? findMissingChartScoreIds(mergedMaster, baseCharts) : [];
      const hydrated = missingScoreIds.length > 0
        ? await downloadMissingCharts(chartsOverlayUrl, message.masterOverlayUrl, missingScoreIds)
        : { charts: [], musicLengthsMs: {} };

      let created = null;
      let expectedDatasetId = message.deckDataSha256;
      let activeData = data;

      if (hydrated.charts.length > 0) {
        const baseProvenance = record(data.provenance) ? data.provenance : {};
        const baseReplay = record(baseProvenance.replay) ? baseProvenance.replay : {};
        const baseLengths = record(baseReplay.musicLengthsMs) ? baseReplay.musicLengthsMs : {};
        const withCharts = await tryCreateCandidateSolver(DeckSolver, {
          ...data,
          provenance: {
            ...baseProvenance,
            replay: {
              ...baseReplay,
              musicLengthsMs: { ...baseLengths, ...hydrated.musicLengthsMs },
            },
          },
          master: mergedMaster,
          charts: [...baseCharts, ...hydrated.charts],
        });
        if (withCharts) {
          created = withCharts.solver;
          expectedDatasetId = withCharts.datasetId;
          activeData = withCharts.data;
        }
      }

      if (!created && overlay) {
        const withMasterOnly = await tryCreateCandidateSolver(DeckSolver, {
          ...data,
          master: mergedMaster,
        });
        if (withMasterOnly) {
          created = withMasterOnly.solver;
          expectedDatasetId = withMasterOnly.datasetId;
          activeData = withMasterOnly.data;
        }
      }

      if (!created) {
        try { created = new DeckSolver(new Uint8Array(deckData), { datasetId: message.deckDataSha256 }); }
        catch (error) { throw new Failure('init', 'DeckSolver: ' + describe(error)); }
        expectedDatasetId = message.deckDataSha256;
        activeData = data;
      }

      const catalog = dataCatalog(activeData);
      const datasetId = typeof created.datasetId === 'string' ? created.datasetId : '';
      if (datasetId !== expectedDatasetId) {
        created.free?.();
        throw new Failure('integrity', 'The solver reports dataset ' + (datasetId || '(none)') + ', expected ' + expectedDatasetId);
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
      }, message.progressIntervalMs, message.seedJson);
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

  function growth(message) {
    const problem = invalidGrowth(message);
    const binding = typeof message.jobId === 'string' && message.jobId ? { jobId: message.jobId, ...(Number.isSafeInteger(message.inputRevision) ? { inputRevision: message.inputRevision } : {}) } : {};
    if (problem) { post({ type: 'failed', ...binding, code: 'protocol', message: problem }); return; }
    const { jobId, inputRevision } = message;
    if (crashed) { post({ type: 'failed', ...binding, code: 'runtime', message: 'The solver stopped after an earlier crash' }); return; }
    if (!solver) {
      post({ type: 'failed', ...binding, code: failure ? failure.code : 'protocol', message: failure ? 'Initialization failed: ' + failure.message : 'The Worker is not initialized' });
      return;
    }
    if (typeof solver.evaluateGrowth !== 'function') {
      post({
        type: 'growthResult',
        jobId,
        inputRevision,
        growthJson: JSON.stringify({ format: 'moenotes.deck-growth/1', status: 'invalid', metricKind: 'power', baseline: null, scenarios: [], cards: [], elapsedMs: 0, message: 'growth-unsupported-runtime' }),
      });
      return;
    }
    let growthJson;
    try {
      growthJson = solver.evaluateGrowth(message.accountJson, message.requestJson, message.teamJson);
    } catch (error) {
      crashed = true;
      post({ type: 'failed', ...binding, code: 'runtime', message: describe(error) });
      return;
    }
    if (typeof growthJson !== 'string') {
      crashed = true;
      post({ type: 'failed', ...binding, code: 'runtime', message: 'DeckSolver.evaluateGrowth returned no result text' });
      return;
    }
    post({ type: 'growthResult', jobId, inputRevision, growthJson });
  }

  async function dispatch(message) {
    if (!record(message)) { post({ type: 'failed', code: 'protocol', message: 'Not a message object' }); return; }
    if (message.type === 'init') return initialize(message);
    if (message.type === 'run') return run(message);
    if (message.type === 'growth') return growth(message);
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

// Classic Worker. ONNX Runtime's glue runs only after its SHA-256 matches the bundle; the pipeline module and the
// runtime loader are this site's own files next to the Worker. Every model, threshold and crop parameter comes from
// the verified models manifest, every reference embedding from the verified gallery.
let latest = null, queue = Promise.resolve(), engine = null, engineKey = null;
const clock = () => performance.timeOrigin + performance.now();
const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('');

// Bundle files are content-addressed (`<sha256>.<ext>`); a cached copy is used only if its bytes still match.
async function checkedFetch(url, expected, context, bytes) {
  context.check('assetFetch');
  const response = await fetch(url, { signal: context.abort.signal, credentials: 'omit' });
  if (!response.ok) throw new Error('assetHttp:' + response.status);
  const body = await response.arrayBuffer();
  if (bytes !== undefined && body.byteLength !== bytes) throw new Error('assetLengthMismatch');
  if (await sha(body) !== expected) throw new Error('assetHashMismatch');
  context.check('assetVerified');
  return body;
}

// Files named by a manifest are siblings of that manifest: `<sha256>.<ext>`, the SHA-256 the record carries.
const siblingResolver = manifestUrl => {
  const base = new URL('.', manifestUrl);
  return record => {
    const file = record?.file;
    if (typeof file !== 'string' || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(file) || file.slice(0, 64) !== record.sha256) throw new Error('invalidAssetPath');
    return new URL(file, base).href;
  };
};
const json = bytes => JSON.parse(new TextDecoder().decode(bytes));

async function initialize(configuration, context, core) {
  const key = [configuration.modelsUrl, configuration.modelsSha256, configuration.galleryUrl, configuration.gallerySha256].join('#');
  if (engine && engineKey === key) return engine;
  const models = core.parseModels(json(await checkedFetch(configuration.modelsUrl, configuration.modelsSha256, context)));
  const gallery = core.parseGallery(json(await checkedFetch(configuration.galleryUrl, configuration.gallerySha256, context)), models);
  if (gallery.galleryId !== context.binding.galleryId) throw new Error('galleryBindingMismatch');
  const content = { ...gallery }; delete content.galleryId;
  if (await sha(new TextEncoder().encode(core.canonicalJson(content))) !== gallery.galleryId) throw new Error('galleryIdentityMismatch');
  const fromModels = siblingResolver(configuration.modelsUrl), fromGallery = siblingResolver(configuration.galleryUrl);
  const references = {};
  for (const kind of core.KINDS) {
    const section = gallery.embeddings[kind];
    references[kind] = core.embeddingRows(section, await checkedFetch(fromGallery(section.buffer), section.buffer.sha256, context, section.buffer.bytes));
  }
  if (!self.boxLensLoadOrt) importScripts(new URL('./ort-runtime-loader.js', self.location.href).href);
  const runtime = await self.boxLensLoadOrt(Object.fromEntries(Object.entries(models.runtime).map(([role, record]) => [role, { ...record, url: fromModels(record) }])),
    { check: context.check, signal: context.abort.signal });
  engine = { models, gallery, references, ort: runtime.ort, runtimeId: runtime.runtimeId, sessions: new Map(), resolve: fromModels };
  engineKey = key;
  return engine;
}

// One session per model file, created on first use from verified bytes.
async function session(record, context) {
  if (!engine.sessions.has(record.sha256)) {
    const promise = (async () => {
      const bytes = await checkedFetch(engine.resolve(record), record.sha256, context, record.bytes);
      context.check('sessionCreate');
      const created = await engine.ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      if (created.inputNames.length !== 1 || created.inputNames[0] !== 'image') throw new Error('unsupportedModelInterface');
      return created;
    })();
    engine.sessions.set(record.sha256, promise);
    promise.catch(() => { if (engine?.sessions.get(record.sha256) === promise) engine.sessions.delete(record.sha256); });
  }
  return engine.sessions.get(record.sha256);
}

async function run(record, data, dims, context, phase) {
  const model = await session(record, context);
  context.check(phase);
  const outputs = await model.run({ image: new engine.ort.Tensor('float32', data, dims) });
  context.check(phase + 'Done');
  return outputs;
}

// Runs a per-kind model over crops in chunks; returns one Float32Array row per crop.
async function classifyCrops(record, rects, input, border, rgba, width, height, context, phase, core) {
  const [inputHeight, inputWidth] = input, size = 3 * inputWidth * inputHeight, rows = [];
  for (let start = 0; start < rects.length; start += 32) {
    const chunk = rects.slice(start, start + 32), data = new Float32Array(chunk.length * size);
    chunk.forEach((rect, index) => core.sampleRect(rgba, width, height, rect, inputWidth, inputHeight, border, data, index * size));
    const outputs = await run(record, data, [chunk.length, 3, inputHeight, inputWidth], context, phase);
    const output = outputs[Object.keys(outputs)[0]], columns = output.dims[1];
    if (output.dims.length !== 2 || output.dims[0] !== chunk.length) throw new Error('invalidModelOutput');
    for (let index = 0; index < chunk.length; index++) rows.push(output.data.slice(index * columns, (index + 1) * columns));
  }
  return rows;
}

async function recognize(rgba, width, height, allowed, context, core) {
  const { models, gallery, references } = engine;
  const input = core.letterbox(rgba, width, height, models.locator);
  const located = await run(models.locator.model, input.data, input.dims, context, 'locator');
  const tiles = core.decodeLocator(located.heatmap, located.size, located.offset, models.locator, { scale: input.scale, imageWidth: width, imageHeight: height });
  const results = tiles.map(tile => ({ ...tile, visibleFraction: core.visibleFraction(tile.bbox, width, height) }));
  for (const kind of core.KINDS) {
    const chosen = results.filter(item => item.kind === kind);
    if (!chosen.length) continue;
    const encoder = models.encoders[kind], section = gallery.embeddings[kind];
    // Only references the selected server's catalogue has take part in the nearest-neighbour decision.
    const rows = section.cards.map((card, row) => ({ card, row })).filter(({ card }) => allowed.has(kind + ':' + gallery.cards[card].id)).map(({ row }) => row);
    const embeddings = await classifyCrops(encoder.model, chosen.map(item => core.artWindow(models, kind, item.bbox)), encoder.input, 'replicate', rgba, width, height, context, 'encoder', core);
    chosen.forEach((item, index) => {
      const decision = core.decideIdentity(core.nearest(references[kind], section.dimension, embeddings[index], rows), encoder);
      const card = decision.row === null ? null : gallery.cards[section.cards[decision.row]];
      Object.assign(item, { accepted: decision.accepted, card, similarity: decision.similarity, margin: decision.margin });
    });
    const fieldRule = models.fields[kind], rankRule = models.ranks[kind];
    const fieldItems = chosen.filter(item => core.insideImage(core.fieldRegion(models, kind, item.bbox), width, height, fieldRule.edge));
    const fieldRects = fieldItems.map(item => core.fieldRegion(models, kind, item.bbox));
    const fieldLogits = await classifyCrops(fieldRule.model, fieldRects, fieldRule.input, 'zero', rgba, width, height, context, 'fields', core);
    fieldItems.forEach((item, index) => {
      if (fieldLogits[index].length !== fieldRule.classes) throw new Error('invalidModelOutput');
      item.field = { ...core.decideField(kind, fieldLogits[index], fieldRule, item.accepted ? item.card.levelLimit : Infinity), bbox: core.roundBox(fieldRects[index]) };
    });
    const rankItems = chosen.filter(item => core.insideImage(core.rankIconBox(models, kind, item.bbox), width, height, rankRule.edge));
    const rankRects = rankItems.map(item => core.rankRegion(models, kind, item.bbox));
    const rankLogits = await classifyCrops(rankRule.model, rankRects, rankRule.input, 'zero', rgba, width, height, context, 'ranks', core);
    rankItems.forEach((item, index) => {
      if (rankLogits[index].length !== rankRule.classes) throw new Error('invalidModelOutput');
      item.rank = { ...core.decideRank(rankLogits[index], rankRule), bbox: core.roundBox(rankRects[index]) };
    });
  }
  const evidence = (reading, record) => reading.value === null ? reading : { ...reading, method: 'boxLensClassifierOrtWasm', modelSha256: record.sha256, runtimeId: engine.runtimeId };
  const cropped = reason => ({ value: null, confidence: 0, reason });
  const out = { cards: [], unidentified: [] };
  for (const item of core.readingOrder(results)) {
    const fieldModel = models.fields[item.kind].model, rankModel = models.ranks[item.kind].model;
    const level = item.field ? { ...item.field.level, bbox: item.field.bbox } : cropped('cropped');
    const awake = item.kind === 'snap' ? cropped('notApplicable') : item.field ? { ...item.field.awake, bbox: item.field.bbox } : cropped('cropped');
    const common = { kind: item.kind, bbox: core.roundBox(item.bbox), locatorScore: core.round(item.score, 4), visibleFraction: core.round(item.visibleFraction, 4),
      identitySimilarity: core.round(item.similarity, 4), identityMargin: core.round(item.margin, 4), displayMode: item.field?.displayMode ?? 'unknown',
      level: evidence(level, fieldModel), card_rank: evidence(item.rank ?? cropped('croppedRankIcon'), rankModel), awake_count: evidence(awake, fieldModel) };
    if (item.accepted) out.cards.push({ ...common, id: item.card.id, identityMethod: 'boxLensEncoderOrtWasm', review: true });
    else out.unidentified.push({ ...common, candidate: item.card?.id ?? null, review: true });
  }
  return out;
}

self.onmessage = event => {
  const request = event.data;
  if (request?.type === 'cancel') {
    if (latest && ['jobId', 'inputRevision', 'datasetId', 'galleryId'].every(key => latest.binding[key] === request.binding?.[key])) {
      latest.cancelled = true; latest.abort.abort();
    }
    return;
  }
  if (request?.type !== 'recognize') return;
  if (latest) { latest.stale = true; latest.abort.abort(); }
  const context = { binding: request.binding, abort: new AbortController(), started: clock(), cancelled: false, stale: false };
  latest = context;
  queue = queue.catch(() => {}).then(async () => {
    try {
      const core = await import('./pipeline.mjs');
      context.binding = core.binding(request.binding);
      const limit = request.budget?.timeLimitMs, declared = request.budget?.deadlineEpochMs;
      if (!Number.isFinite(limit) || limit < 0 || limit > 120000 || !Number.isFinite(declared)) throw new Error('invalidBudget');
      context.deadline = Math.min(declared, context.started + limit);
      context.check = phase => {
        if (context.cancelled) throw new Error('cancelled');
        if (context.stale || latest !== context) throw new Error('stale');
        if (clock() >= context.deadline) throw new Error('timeLimit');
        self.postMessage({ type: 'progress', binding: context.binding, phase, elapsedMs: clock() - context.started });
      };
      context.check('start');
      const { width, height, rgba, sourceId } = request.image ?? {};
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 24000000 ||
          !(rgba instanceof ArrayBuffer) || rgba.byteLength !== width * height * 4 || typeof sourceId !== 'string') throw new Error('invalidImage');
      const allowed = new Set(Array.isArray(request.cards) ? request.cards.filter(key => typeof key === 'string') : []);
      if (!allowed.size) throw new Error('noCatalogueCards');
      await initialize(request.configuration, context, core);
      if (engine.gallery.galleryId !== context.binding.galleryId) throw new Error('galleryBindingMismatch');
      const output = await recognize(new Uint8Array(rgba), width, height, allowed, context, core);
      const decodedPixelSha256 = await sha(rgba);
      context.check('publish');
      self.postMessage({ type: 'result', binding: context.binding, status: 'complete', ...output, sourceId, decodedPixelSha256, elapsedMs: clock() - context.started,
        scope: { coverage: 'observed_only', fullScanCertified: false, galleryId: engine.gallery.galleryId, modelsSha256: request.configuration.modelsSha256,
          catalog: engine.gallery.catalog.map(({ region, masterVersion }) => ({ region, masterVersion })), source: engine.models.source } });
    } catch (error) {
      const reason = context.cancelled ? 'cancelled' : context.stale || latest !== context ? 'stale' : clock() >= context.deadline ? 'timeLimit' : String(error?.message ?? error);
      const status = ['cancelled', 'stale', 'timeLimit'].includes(reason) ? reason : 'failed';
      self.postMessage({ type: 'result', binding: context.binding, status, cards: [], unidentified: [], sourceId: request.image?.sourceId,
        elapsedMs: clock() - context.started, error: reason });
    }
  });
};

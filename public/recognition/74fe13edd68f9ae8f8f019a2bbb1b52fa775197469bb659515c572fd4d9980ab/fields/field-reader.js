/* Frozen BoxLens NumberReader geometry and decision rules, genuine ORT WASM only. */
(function (scope) {
  'use strict';
  const WIDTH = 144, HEIGHT = 56, CONFIDENCE = .995, MARGIN = .5;
  const field = (value = null, confidence = 0, reason) => ({ value, confidence: Math.round(confidence * 10000) / 10000, ...(reason ? { reason } : {}) });
  const empty = reason => ({ level: field(null, 0, reason), awake_count: field(null, 0, reason), display_mode: 'unknown' });
  const check = (control, phase) => control?.check(phase);
  const sessions = new Map();
  const hex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');

  async function verifiedBytes(record, control) {
    if (!record || !/^[a-f0-9]{64}$/.test(record.sha256) || !Number.isSafeInteger(record.size) || record.size < 0) throw new Error('Invalid field model identity');
    check(control, 'field-model-before-fetch');
    const response = await fetch(record.url, { signal: control?.signal });
    if (!response.ok) throw new Error('Field model download failed');
    const bytes = await response.arrayBuffer();
    check(control, 'field-model-after-fetch');
    if (bytes.byteLength !== record.size || hex(await crypto.subtle.digest('SHA-256', bytes)) !== record.sha256) throw new Error('Field model source mismatch');
    check(control, 'field-model-after-verification');
    return new Uint8Array(bytes);
  }

  async function sessionFor(ort, config, control) {
    // These flags are set before session construction, inside the recognition worker.
    if (!ort || !config?.model || !config.wasmBase) throw new Error('Actual field WASM runtime is unavailable');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = config.wasmPaths ?? config.wasmBase;
    if (config.wasmBinary) ort.env.wasm.wasmBinary = config.wasmBinary;
    ort.env.logLevel = 'error';
    const key = `${config.runtimeId}:${config.model.sha256}`;
    if (!sessions.has(key)) {
      const promise = (async () => {
        const bytes = await verifiedBytes(config.model, control);
        check(control, 'field-session-before-create');
        const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
        check(control, 'field-session-after-create');
        if (session.inputNames.length !== 1 || session.inputNames[0] !== 'image' || session.outputNames.length !== 1) throw new Error('Unsupported field model interface');
        return session;
      })();
      sessions.set(key, promise);
      promise.catch(() => { if (sessions.get(key) === promise) sessions.delete(key); });
    }
    const session = await sessions.get(key);
    check(control, 'field-session-ready');
    return session;
  }

  function makePatch(cv, image, item) {
    if (!Array.isArray(item.bbox) || item.bbox.length !== 4 || !item.bbox.every(Number.isFinite) || !['member', 'snap'].includes(item.kind)) throw new Error('Invalid field crop');
    const [x, y, width, height] = item.bbox;
    if (width <= 0 || height <= 0) return null;
    const scale = width / (item.kind === 'member' ? 212 : 314);
    const left = x - 12 * scale, top = y + height - 50 * scale;
    const right = left + WIDTH * scale, bottom = top + HEIGHT * scale;
    if (left < 2 || top < 2 || right > image.cols - 2 || bottom > image.rows - 2) return null;
    const matrix = cv.matFromArray(2, 3, cv.CV_32F, [scale, 0, left, 0, scale, top]);
    const patch = new cv.Mat();
    try {
      cv.warpAffine(image, patch, matrix, new cv.Size(WIDTH, HEIGHT), cv.INTER_LINEAR | cv.WARP_INVERSE_MAP, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
      if (patch.rows !== HEIGHT || patch.cols !== WIDTH || patch.channels() !== 3) throw new Error('Field crop must use original BGR pixels');
      const data = new Float32Array(3 * WIDTH * HEIGHT), pixels = patch.data;
      const plane = WIDTH * HEIGHT;
      for (let pixel = 0; pixel < plane; pixel++) {
        data[pixel] = pixels[3 * pixel + 2] / 255;
        data[plane + pixel] = pixels[3 * pixel + 1] / 255;
        data[2 * plane + pixel] = pixels[3 * pixel] / 255;
      }
      return data;
    } finally { patch.delete(); matrix.delete(); }
  }

  function classify(logits, kind) {
    let maximum = -Infinity;
    for (const value of logits) { if (!Number.isFinite(value)) throw new Error('Non-finite field logits'); maximum = Math.max(maximum, value); }
    const probabilities = Float32Array.from(logits, value => Math.exp(Math.fround(value - maximum)));
    let sum = 0;
    for (const value of probabilities) sum += value;
    let first = -1, second = -1;
    for (let index = 0; index < probabilities.length; index++) {
      probabilities[index] = Math.fround(probabilities[index] / sum);
      if (first < 0 || probabilities[index] > probabilities[first] || (probabilities[index] === probabilities[first] && index > first)) { second = first; first = index; }
      else if (second < 0 || probabilities[index] > probabilities[second]) second = index;
    }
    const confidence = probabilities[first], margin = confidence - probabilities[second];
    if (first === 0) {
      const certain = confidence >= CONFIDENCE && margin >= MARGIN;
      return { ...empty(certain ? 'other_or_hidden_parameter' : 'ambiguous_parameter'), display_mode: certain ? 'other' : 'unknown' };
    }
    if (confidence < CONFIDENCE || margin < MARGIN) {
      const result = empty('ambiguous_parameter');
      result.level.confidence = Math.round(confidence * 10000) / 10000;
      return result;
    }
    if (first > 100) return kind === 'member'
      ? { ...empty('not_visible_in_training_view'), awake_count: field(first - 100, confidence), display_mode: 'training' }
      : empty('unsupported_parameter');
    return { ...empty('not_visible_in_level_view'), level: field(first, confidence), display_mode: 'level' };
  }

  async function readFields({ cv, image, items, control, ort = scope.ort, config }) {
    check(control, 'field-start');
    const results = items.map(() => empty('cropped'));
    const patches = [], indices = [];
    for (let index = 0; index < items.length; index++) {
      check(control, 'field-before-crop');
      const patch = makePatch(cv, image, items[index]);
      check(control, 'field-after-crop');
      if (patch) { patches.push(patch); indices.push(index); }
    }
    if (!patches.length) return results;
    const session = await sessionFor(ort, config, control);
    const batchLimit = 16, stride = 3 * WIDTH * HEIGHT;
    for (let offset = 0; offset < patches.length; offset += batchLimit) {
      check(control, 'field-before-inference');
      const batch = patches.slice(offset, offset + batchLimit), tensorData = new Float32Array(batch.length * stride);
      batch.forEach((patch, index) => tensorData.set(patch, index * stride));
      const input = new ort.Tensor('float32', tensorData, [batch.length, 3, HEIGHT, WIDTH]);
      let output;
      try {
        output = await session.run({ image: input });
        check(control, 'field-after-inference');
        const logits = output[session.outputNames[0]];
        if (logits.type !== 'float32' || logits.dims.length !== 2 || logits.dims[0] !== batch.length || logits.dims[1] !== 106) throw new Error('Unsupported field output');
        for (let index = 0; index < batch.length; index++) results[indices[offset + index]] = classify(logits.data.subarray(index * 106, (index + 1) * 106), items[indices[offset + index]].kind);
      } finally {
        input.dispose?.();
        if (output) for (const tensor of Object.values(output)) tensor.dispose?.();
      }
    }
    for (let index = 0; index < results.length; index++) {
      const item = items[index], [x, y, width, height] = item.bbox;
      const scale = width / (item.kind === 'member' ? 212 : 314);
      for (const name of ['level', 'awake_count']) if (results[index][name].value !== null) {
        results[index][name].bbox = [x - 12 * scale, y + height - 50 * scale, WIDTH * scale, HEIGHT * scale];
        results[index][name].method = 'boxLensNumberReaderOrtWasm';
        results[index][name].modelSha256 = config.model.sha256;
        results[index][name].runtimeId = config.runtimeId;
      }
    }
    check(control, 'field-complete');
    return results;
  }
  scope.boxLensReadFields = readFields;
  scope.boxLensFieldReaderInternals = { makePatch, classify };
})(globalThis);

// Screenshot recognition pipeline: the pure parts the Worker runs around its ONNX models, shared with the tests.
// A locator finds every card tile and its kind; a per-kind encoder embeds each tile's artwork window, which is
// compared with the gallery's reference embeddings of the same kind; per-kind readers read the visible level or
// training count and the card rank. Every model, threshold and crop parameter comes from the models manifest.

export const KINDS = Object.freeze(['member', 'snap']);
export const MODELS_FORMAT = 'moenotes.recognition-models/1';
export const GALLERY_FORMAT = 'moenotes.embedding-gallery/1';
const HEX64 = /^[a-f0-9]{64}$/;
const FILE = /^[a-f0-9]{64}\.[a-z0-9]+$/;
const BINDING_KEYS = ['jobId', 'inputRevision', 'datasetId', 'galleryId'];

export function canonicalId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || value.length > 19 ||
      (value.length === 19 && value > '9223372036854775807')) throw new Error('invalidCanonicalId');
  return value;
}

export function binding(value) {
  for (const key of BINDING_KEYS) if (typeof value?.[key] !== 'string' || !value[key]) throw new Error('invalidBinding:' + key);
  return Object.freeze(Object.fromEntries(BINDING_KEYS.map(key => [key, value[key]])));
}

export const sameBinding = (a, b) => BINDING_KEYS.every(key => a?.[key] === b?.[key]);

/** Keys sorted, no spaces, numbers as JSON.stringify writes them: the form `galleryId` hashes. */
export const canonicalJson = value => Array.isArray(value) ? '[' + value.map(canonicalJson).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
    : JSON.stringify(value);

const round = (value, digits) => Number(value.toFixed(digits));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const count = value => Number.isSafeInteger(value) && value >= 1;
const between = (value, low, high) => finite(value) && value >= low && value <= high;
const pair = (value, test) => Array.isArray(value) && value.length === 2 && value.every(test);

/** A file next to its manifest: `<sha256>.<ext>`, the SHA-256 and size it must have. */
export function fileRecord(value, code = 'invalidModelsManifest') {
  if (!value || typeof value.file !== 'string' || !FILE.test(value.file) || value.file.slice(0, 64) !== value.sha256 ||
      !HEX64.test(value.sha256) || !count(value.bytes)) throw new Error(code);
  return value;
}

/** The models manifest: ONNX Runtime Web, the tile sizes and every stage with its model and parameters. */
export function parseModels(manifest) {
  const bad = () => { throw new Error('invalidModelsManifest'); };
  if (manifest?.format !== MODELS_FORMAT) throw new Error('invalidModelsFormat');
  for (const role of ['glue', 'module', 'wasm']) fileRecord(manifest.runtime?.[role]);
  for (const kind of KINDS) if (!pair(manifest.tiles?.[kind], value => finite(value) && value > 0)) bad();
  const locator = manifest.locator;
  fileRecord(locator?.model);
  if (canonicalJson(locator.classes) !== canonicalJson(KINDS) || !['longEdge', 'multiple', 'stride', 'maxPeaks', 'maxDetections'].every(key => count(locator[key]))
      || !(Number.isSafeInteger(locator.pad) && between(locator.pad, 0, 255)) || !['threshold', 'overlap', 'minVisible'].every(key => between(locator[key], 0, 1))) bad();
  for (const stage of ['encoders', 'fields', 'ranks']) for (const kind of KINDS) {
    const item = manifest[stage]?.[kind];
    fileRecord(item?.model);
    if (!pair(item.input, count)) bad();
    if (stage === 'encoders') {
      if (!(finite(item.inset) && item.inset >= 0) || !between(item.similarity, -1, 1) || !between(item.margin, 0, 2)) bad();
      continue;
    }
    if (!(count(item.classes) && item.classes >= 2) || !(finite(item.edge) && item.edge >= 0) || !between(item.confidence, 0, 1) || !between(item.margin, 0, 1)) bad();
    if (stage === 'fields' && (!['left', 'bottom'].every(key => finite(item[key])) || !['width', 'height'].every(key => finite(item[key]) && item[key] > 0))) bad();
    if (stage === 'ranks' && (!pair(item.center, finite) || !(finite(item.size) && item.size > 0) || !pair(item.icon, value => finite(value) && value > 0))) bad();
  }
  return manifest;
}

/** The gallery manifest: card identities and level limits, and per kind the reference embeddings of its encoder. */
export function parseGallery(manifest, models) {
  const bad = () => { throw new Error('invalidGallery'); };
  if (manifest?.format !== GALLERY_FORMAT) throw new Error('invalidGalleryFormat');
  if (!HEX64.test(manifest.galleryId ?? '') || !Array.isArray(manifest.cards)) bad();
  const keys = new Set();
  for (const card of manifest.cards) {
    canonicalId(card?.id);
    if (!KINDS.includes(card.kind) || !count(card.levelLimit) || keys.has(card.kind + ':' + card.id)) bad();
    keys.add(card.kind + ':' + card.id);
  }
  for (const kind of KINDS) {
    const section = manifest.embeddings?.[kind];
    if (!section || !count(section.dimension) || !Array.isArray(section.cards) || new Set(section.cards).size !== section.cards.length
        || section.cards.some(index => !Number.isSafeInteger(index) || manifest.cards[index]?.kind !== kind)) bad();
    fileRecord(section.buffer, 'invalidGallery');
    if (!pair(section.buffer.shape, Number.isSafeInteger) || section.buffer.shape[0] !== section.cards.length || section.buffer.shape[1] !== section.dimension
        || section.buffer.bytes !== 4 * section.cards.length * section.dimension) bad();
    if (section.encoder?.sha256 !== models.encoders[kind].model.sha256) throw new Error('galleryEncoderMismatch');
  }
  return manifest;
}

/** One kind's reference rows (float32, unit length) from its verified buffer. */
export function embeddingRows(section, buffer) {
  const rows = new Float32Array(buffer);
  if (rows.length !== section.cards.length * section.dimension || rows.some(value => !Number.isFinite(value))) throw new Error('invalidGalleryBuffer');
  return rows;
}

// ---------------------------------------------------------------- locator input and output
const roundHalfEven = value => { const r = Math.round(value); return Math.abs(value % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; };

export function letterboxGeometry(width, height, { longEdge, multiple }) {
  const scale = longEdge / Math.max(width, height);
  const resizedWidth = Math.max(1, roundHalfEven(width * scale)), resizedHeight = Math.max(1, roundHalfEven(height * scale));
  return { scale, resizedWidth, resizedHeight,
    inputWidth: Math.ceil(resizedWidth / multiple) * multiple, inputHeight: Math.ceil(resizedHeight / multiple) * multiple };
}

// Area-averaging weights of one axis (each output pixel covers `source / target` input pixels), as OpenCV's INTER_AREA.
function areaTable(source, target) {
  const scale = 1 / (target / source), table = [];
  for (let d = 0; d < target; d++) {
    const f1 = d * scale, f2 = f1 + scale, cell = Math.min(scale, source - f1);
    let s1 = Math.ceil(f1), s2 = Math.floor(f2);
    s2 = Math.min(s2, source - 1); s1 = Math.min(s1, s2);
    const entries = [];
    if (s1 - f1 > 1e-3) entries.push([s1 - 1, Math.fround((s1 - f1) / cell)]);
    for (let s = s1; s < s2; s++) entries.push([s, Math.fround(1 / cell)]);
    if (f2 - s2 > 1e-3) entries.push([s2, Math.fround(Math.min(f2 - s2, 1, cell) / cell)]);
    table.push(entries);
  }
  return table;
}

// Bilinear weights with pixel centres aligned (enlarging), as OpenCV's INTER_LINEAR resize.
function linearTable(source, target) {
  const scale = source / target, table = [];
  for (let d = 0; d < target; d++) {
    let f = (d + 0.5) * scale - 0.5, s = Math.floor(f);
    f -= s;
    if (s < 0) { s = 0; f = 0; }
    if (s >= source - 1) { s = source - 1; f = 0; }
    table.push(f ? [[s, 1 - f], [s + 1, f]] : [[s, 1]]);
  }
  return table;
}

const roundByte = value => { const r = Math.round(value); const even = Math.abs(value % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; return even < 0 ? 0 : even > 255 ? 255 : even; };

/** RGB pixels of an RGBA image resized to `targetWidth` x `targetHeight` (area averaging when shrinking), accumulated in
 * float32 like OpenCV so shrunk screenshots match it to the byte. */
export function resizeRgb(rgba, width, height, targetWidth, targetHeight) {
  const shrink = targetWidth <= width && targetHeight <= height;
  const xs = shrink ? areaTable(width, targetWidth) : linearTable(width, targetWidth);
  const ys = shrink ? areaTable(height, targetHeight) : linearTable(height, targetHeight);
  const rows = new Float32Array(height * targetWidth * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < targetWidth; x++) {
    let r = 0, g = 0, b = 0;
    for (const [s, w] of xs[x]) { const i = (y * width + s) * 4; r = Math.fround(r + Math.fround(rgba[i] * w)); g = Math.fround(g + Math.fround(rgba[i + 1] * w)); b = Math.fround(b + Math.fround(rgba[i + 2] * w)); }
    const o = (y * targetWidth + x) * 3; rows[o] = r; rows[o + 1] = g; rows[o + 2] = b;
  }
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 3);
  for (let y = 0; y < targetHeight; y++) for (let x = 0; x < targetWidth; x++) for (let c = 0; c < 3; c++) {
    let v = 0;
    for (const [s, w] of ys[y]) v = Math.fround(v + Math.fround(rows[(s * targetWidth + x) * 3 + c] * w));
    out[(y * targetWidth + x) * 3 + c] = roundByte(v);
  }
  return out;
}

/** The locator input: the screenshot resized so its long edge is `longEdge`, at the top-left of a grey canvas whose
 * sides are multiples of `multiple`; float32 [1, 3, H, W], RGB in 0..1. */
export function letterbox(rgba, width, height, locator) {
  const g = letterboxGeometry(width, height, locator);
  const resized = resizeRgb(rgba, width, height, g.resizedWidth, g.resizedHeight);
  const plane = g.inputWidth * g.inputHeight, data = new Float32Array(3 * plane).fill(locator.pad / 255);
  for (let y = 0; y < g.resizedHeight; y++) for (let x = 0; x < g.resizedWidth; x++) {
    const i = (y * g.resizedWidth + x) * 3, o = y * g.inputWidth + x;
    data[o] = resized[i] / 255; data[plane + o] = resized[i + 1] / 255; data[2 * plane + o] = resized[i + 2] / 255;
  }
  return { data, dims: [1, 3, g.inputHeight, g.inputWidth], scale: g.scale };
}

export function visibleFraction(rect, width, height) {
  const w = Math.min(width, rect[0] + rect[2]) - Math.max(0, rect[0]), h = Math.min(height, rect[1] + rect[3]) - Math.max(0, rect[1]);
  return w <= 0 || h <= 0 ? 0 : w * h / Math.max(rect[2] * rect[3], 1e-9);
}

export function overlapOfSmaller(a, b) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]), h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w <= 0 || h <= 0 ? 0 : w * h / Math.max(Math.min(a[2] * a[3], b[2] * b[3]), 1e-9);
}

/** Card tiles from the locator outputs ({data, dims} tensors): 3x3 local maxima of each class heatmap at or above
 * `threshold`, their size and offset, back in screenshot pixels; tiles less than `minVisible` inside the screenshot are
 * dropped, then by descending score any tile covering more than `overlap` of a smaller kept one. */
export function decodeLocator(heatmap, size, offset, locator, { scale, imageWidth, imageHeight }) {
  const [, classes, h, w] = heatmap.dims, plane = h * w, heat = heatmap.data, peaks = [];
  if (classes !== locator.classes.length || size.dims[1] !== 2 || offset.dims[1] !== 2 || size.dims[2] !== h || size.dims[3] !== w
      || offset.dims[2] !== h || offset.dims[3] !== w) throw new Error('invalidLocatorOutput');
  for (let k = 0; k < classes; k++) {
    const base = k * plane;
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
      const v = heat[base + i * w + j];
      if (!(v >= locator.threshold)) continue;
      let peak = true;
      for (let di = -1; di <= 1 && peak; di++) for (let dj = -1; dj <= 1; dj++) {
        const y = i + di, x = j + dj;
        if ((di || dj) && y >= 0 && y < h && x >= 0 && x < w && heat[base + y * w + x] > v) { peak = false; break; }
      }
      if (peak) peaks.push({ k, i, j, score: v });
    }
  }
  // Score descending, then class, row, column: NumPy's stable order.
  peaks.sort((a, b) => (b.score - a.score) || (a.k - b.k) || (a.i - b.i) || (a.j - b.j));
  const out = [];
  for (const p of peaks.slice(0, locator.maxPeaks)) {
    const index = p.i * w + p.j, bw = size.data[index], bh = size.data[plane + index];
    const cx = (p.j + offset.data[index]) * locator.stride, cy = (p.i + offset.data[plane + index]) * locator.stride;
    const bbox = [(cx - bw / 2) / scale, (cy - bh / 2) / scale, bw / scale, bh / scale];
    if (!bbox.every(Number.isFinite) || !(bbox[2] > 0 && bbox[3] > 0)) continue;
    if (visibleFraction(bbox, imageWidth, imageHeight) < locator.minVisible) continue;
    if (out.some(other => overlapOfSmaller(bbox, other.bbox) > locator.overlap)) continue;
    out.push({ kind: locator.classes[p.k], score: p.score, bbox });
    if (out.length >= locator.maxDetections) break;
  }
  return out;
}

/** Tiles in reading order: rows (tiles whose vertical centres lie within half a tile of the row's first), left to right. */
export function readingOrder(items) {
  const sorted = items.slice().sort((a, b) => (a.bbox[1] + a.bbox[3] / 2) - (b.bbox[1] + b.bbox[3] / 2));
  const rows = [];
  for (const item of sorted) {
    const centre = item.bbox[1] + item.bbox[3] / 2, row = rows.at(-1);
    if (row && Math.abs(centre - row.centre) < Math.min(row.height, item.bbox[3]) / 2) row.items.push(item);
    else rows.push({ centre, height: item.bbox[3], items: [item] });
  }
  return rows.flatMap(row => row.items.sort((a, b) => a.bbox[0] - b.bbox[0]));
}

// ---------------------------------------------------------------- crops
/** A tile's scale: screenshot pixels per logical unit, from its width. */
export const tileScale = (models, kind, tile) => tile[2] / models.tiles[kind][0];

/** The artwork window: the tile less `inset` logical units on every side (horizontal and vertical scale apart). */
export function artWindow(models, kind, tile) {
  const [x, y, w, h] = tile, [tw, th] = models.tiles[kind], inset = models.encoders[kind].inset;
  const sx = w / tw, sy = h / th;
  return [x + inset * sx, y + inset * sy, w - 2 * inset * sx, h - 2 * inset * sy];
}

/** The field crop: `left` units from the tile's left edge, `bottom` units above its bottom edge, `width` x `height`. */
export function fieldRegion(models, kind, tile) {
  const [x, y, , h] = tile, s = tileScale(models, kind, tile), field = models.fields[kind];
  return [x + field.left * s, y + h - field.bottom * s, field.width * s, field.height * s];
}

/** The rank crop: a `size` square around `center` (tile units). */
export function rankRegion(models, kind, tile) {
  const [x, y] = tile, s = tileScale(models, kind, tile), rank = models.ranks[kind];
  return [x + (rank.center[0] - rank.size / 2) * s, y + (rank.center[1] - rank.size / 2) * s, rank.size * s, rank.size * s];
}

/** The rank icon's own box (`icon` width and height around `center`), which must lie inside the screenshot. */
export function rankIconBox(models, kind, tile) {
  const [x, y] = tile, s = tileScale(models, kind, tile), rank = models.ranks[kind];
  return [x + (rank.center[0] - rank.icon[0] / 2) * s, y + (rank.center[1] - rank.icon[1] / 2) * s, rank.icon[0] * s, rank.icon[1] * s];
}

export const insideImage = (rect, width, height, edge) =>
  rect[0] >= edge && rect[1] >= edge && rect[0] + rect[2] <= width - edge && rect[1] + rect[3] <= height - edge;

/** Bilinear samples of `rect` at `outWidth` x `outHeight`: output pixel (i, j) reads the screenshot at
 * (left + i * w / outWidth, top + j * h / outHeight), integer coordinates at pixel centres; outside the screenshot
 * either black (`zero`) or the nearest edge pixel (`replicate`). Rounded to 8 bits, then RGB in 0..1, planar, written
 * into `out` at `offset`. */
export function sampleRect(rgba, width, height, rect, outWidth, outHeight, border, out = new Float32Array(3 * outWidth * outHeight), offset = 0) {
  const [left, top, w, h] = rect, sx = w / outWidth, sy = h / outHeight, plane = outWidth * outHeight, replicate = border === 'replicate';
  const at = (yy, xx, c) => {
    if (replicate) { xx = xx < 0 ? 0 : xx >= width ? width - 1 : xx; yy = yy < 0 ? 0 : yy >= height ? height - 1 : yy; }
    else if (xx < 0 || yy < 0 || xx >= width || yy >= height) return 0;
    return rgba[(yy * width + xx) * 4 + c];
  };
  for (let j = 0; j < outHeight; j++) {
    const y = top + j * sy, y0 = Math.floor(y), fy = y - y0;
    for (let i = 0; i < outWidth; i++) {
      const x = left + i * sx, x0 = Math.floor(x), fx = x - x0;
      for (let c = 0; c < 3; c++) {
        const v = (1 - fy) * ((1 - fx) * at(y0, x0, c) + fx * at(y0, x0 + 1, c)) + fy * ((1 - fx) * at(y0 + 1, x0, c) + fx * at(y0 + 1, x0 + 1, c));
        out[offset + c * plane + j * outWidth + i] = Math.round(v) / 255;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- decisions
/** The nearest references of one embedding among `rows` (indices into the kind's reference rows), by cosine
 * similarity (both sides are unit vectors): the best `limit`, highest first. */
export function nearest(references, dimension, embedding, rows, limit = 3) {
  const scored = [];
  for (const row of rows) {
    let dot = 0;
    for (let k = 0, base = row * dimension; k < dimension; k++) dot += references[base + k] * embedding[k];
    scored.push({ row, similarity: dot });
  }
  scored.sort((a, b) => b.similarity - a.similarity || a.row - b.row);
  return scored.slice(0, Math.max(2, limit));
}

/** Accepted when the nearest reference reaches `similarity` and exceeds the second by `margin`; otherwise unknown.
 * `matches` comes from nearest(); a single reference has no second (margin against -1). */
export function decideIdentity(matches, rule) {
  const first = matches[0], second = matches[1]?.similarity ?? -1;
  if (!first) return { accepted: false, row: null, similarity: -1, margin: 0 };
  const margin = first.similarity - second;
  return { accepted: first.similarity >= rule.similarity && margin >= rule.margin, row: first.row, similarity: first.similarity, margin };
}

export function softmax(logits) {
  let maximum = -Infinity;
  for (const value of logits) { if (!Number.isFinite(value)) throw new Error('nonFiniteLogits'); maximum = Math.max(maximum, value); }
  const exp = Array.from(logits, value => Math.exp(value - maximum)), sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(value => value / sum);
}

/** The top class, its probability and whether it reaches `confidence` and exceeds the second by `margin`. */
export function acceptClass(probabilities, rule) {
  let top = 0;
  for (let k = 1; k < probabilities.length; k++) if (probabilities[k] > probabilities[top]) top = k;
  let second = 0;
  for (let k = 0; k < probabilities.length; k++) if (k !== top && probabilities[k] > second) second = probabilities[k];
  const confidence = probabilities[top];
  return { top, confidence, ok: confidence >= rule.confidence && confidence - second >= rule.margin };
}

const value = (number, confidence, reason) => ({ value: number, confidence: round(confidence, 4), ...(reason ? { reason } : {}) });

/** A field crop's reading: class 0 another parameter or unreadable, 1-100 a level (not above `levelLimit`), and for
 * Member cards 101-105 a training count. */
export function decideField(kind, logits, rule, levelLimit) {
  const { top, confidence, ok } = acceptClass(softmax(logits), rule);
  const none = reason => ({ level: value(null, confidence, reason), awake: value(null, confidence, reason) });
  if (!ok) return { displayMode: 'unknown', ...none('ambiguous') };
  if (top === 0) return { displayMode: 'other', ...none('otherParameter') };
  if (top <= 100) {
    if (top > levelLimit) return { displayMode: 'unknown', ...none('aboveLevelLimit') };
    return { displayMode: 'level', level: value(top, confidence), awake: value(null, confidence, 'notShown') };
  }
  if (kind === 'member' && top <= 105) return { displayMode: 'training', level: value(null, confidence, 'notShown'), awake: value(top - 100, confidence) };
  return { displayMode: 'unknown', ...none('unsupportedClass') };
}

/** A rank crop's reading: class 0 no readable rank icon, 1-5 the card rank. */
export function decideRank(logits, rule) {
  const { top, confidence, ok } = acceptClass(softmax(logits), rule);
  if (!ok) return value(null, confidence, 'ambiguous');
  if (top === 0) return value(null, confidence, 'noIcon');
  return value(top, confidence);
}

export const roundBox = box => box.map(number => round(number, 2));
export { round };

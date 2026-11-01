/**
 * Gekiso COMBO segment boundary timing opportunities ("Late start" / "Early end"), ported faithfully from Haneoka's
 * runtime chart converter (`SsMusicScoreConverter -> MusicScoreNoteCreator` in binary32 / .NET midpoint-to-even order)
 * and `gekiso-timing.ts`. Pure functions; no network or DOM access.
 */

export interface RawLiveJudgementTiming {
  id?: number;
  assistLevel: number;
  judgementPriority?: number;
  noteJudgementType: number;
  noteSimulateJudgement: number;
  beforeMs: number;
  afterMs: number;
}

export interface PerfectTiming {
  beforeMs: number;
  afterMs: number;
}

export interface PerfectTimingEntry extends PerfectTiming {
  noteJudgementType: number;
}

export interface GekisoTimingSegment {
  opening?: { timeMs: number; notes: number; lateMs: number };
  ending?: { timeMs: number; notes: number; earlyMs: number };
}

export interface RuntimeChartEnumerationNote {
  op: number;
  timeMs: number;
  judgementType: number;
}

export interface RuntimeChartTimingSource {
  feverMs: readonly (readonly [number, number])[];
  enumeration: readonly RuntimeChartEnumerationNote[];
}

const f = Math.fround;
const MAX_LINES = 20;
const UNJUDGED = new Set([0, 80, 82, 100, 103, 121, 122, 123]);
export const isJudgementNote = (op: number): boolean => !UNJUDGED.has(op);

const SLIDE_BEGIN_CLASS = new Set([20, 41, 61, 80, 104]);
const SLIDE_END_CLASS = new Set([22, 42, 62, 82, 105]);
const MERGEABLE = new Set([20, 22, 41, 42, 61, 62, 80, 82, 100, 101, 102, 103, 104, 105]);
const NOTE_TYPES: Readonly<Record<string, number>> = { tap: 0, flick: 1, trace: 2, long: 3, guide: 4, node: 5 };
const FLICK_DIRS: Readonly<Record<string, number>> = { up: 0, left: 1, right: 2, down: 3 };
const EASES: Readonly<Record<string, number>> = { linear: 0, in: 1, out: 2 };

/** Extract base assist-off Perfect windows (`assistLevel === 0 && noteSimulateJudgement === 5`). */
export function extractPerfectTimings(rows: readonly RawLiveJudgementTiming[]): PerfectTimingEntry[] {
  return rows
    .filter((row) => row.assistLevel === 0 && row.noteSimulateJudgement === 5)
    .map((row) => ({
      noteJudgementType: row.noteJudgementType,
      beforeMs: row.beforeMs,
      afterMs: row.afterMs,
    }));
}

export function perfectTimingsMap(rows: readonly (RawLiveJudgementTiming | PerfectTimingEntry)[]): ReadonlyMap<number, PerfectTiming> {
  return new Map(
    rows
      .filter((row) => !("assistLevel" in row) || (row.assistLevel === 0 && row.noteSimulateJudgement === 5))
      .map((row) => [row.noteJudgementType, { beforeMs: row.beforeMs, afterMs: row.afterMs }]),
  );
}

/**
 * Check whether the first judged notes in `[start, end]` form a simultaneous Tap/Flick chord whose next 60 Hz frame
 * still lands before `end` and within every chord note's late Perfect window (`afterMs`).
 */
export function comboOpening(
  notes: readonly RuntimeChartEnumerationNote[],
  start: number,
  end: number,
  afterMs: ReadonlyMap<number, number>,
): { first: number; after: number; frame: number; nextTimeMs: number } | null {
  let first = 0;
  let high = notes.length;
  while (first < high) {
    const middle = (first + high) >> 1;
    if (notes[middle]!.timeMs < start) first = middle + 1;
    else high = middle;
  }
  const note = notes[first];
  if (!note || note.timeMs > end) return null;
  const frame = Math.ceil((note.timeMs * 60) / 1000);
  const nextTimeMs = Math.floor(((frame + 1) * 1000) / 60);
  if (nextTimeMs >= end) return null;
  let after = first;
  while (after < notes.length && Math.ceil((notes[after]!.timeMs * 60) / 1000) === frame && notes[after]!.timeMs <= end) {
    after++;
  }
  if (after - first < 2) return null;
  for (let index = first; index < after; index++) {
    const current = notes[index]!;
    if (
      current.timeMs !== note.timeMs
      || (current.op !== 1 && current.op !== 40)
      || nextTimeMs - current.timeMs > (afterMs.get(current.judgementType) ?? -1)
    ) {
      return null;
    }
  }
  return { first, after, frame, nextTimeMs };
}

/** Compute per-Gekiso-segment `opening` (late start) and `ending` (early end) timing windows. */
export function gekisoTiming(
  source: RuntimeChartTimingSource,
  windows: ReadonlyMap<number, PerfectTiming>,
): GekisoTimingSegment[] {
  const notes = source.enumeration
    .filter((note) => isJudgementNote(note.op))
    .map((note) => ({ op: note.op, timeMs: note.timeMs, judgementType: note.judgementType }))
    .sort((a, b) => a.timeMs - b.timeMs);
  const afterMs = new Map([...windows].map(([type, window]) => [type, window.afterMs]));
  return source.feverMs.map(([start, end]) => {
    const result: GekisoTimingSegment = {};
    const opening = comboOpening(notes, start, end, afterMs);
    if (opening) {
      result.opening = {
        timeMs: notes[opening.first]!.timeMs,
        notes: opening.after - opening.first,
        lateMs: opening.nextTimeMs - notes[opening.first]!.timeMs,
      };
    }
    const ending = notes.filter(
      (note) =>
        note.timeMs === end
        && (note.op === 1 || note.op === 40)
        && (windows.get(note.judgementType)?.beforeMs ?? 0) > 0,
    );
    if (ending.length > 0) {
      result.ending = {
        timeMs: end,
        notes: ending.length,
        earlyMs: Math.min(end - start, ...ending.map((note) => windows.get(note.judgementType)!.beforeMs)),
      };
    }
    return result;
  });
}

function netRound(x: number): number {
  const ip = Math.trunc(x);
  const frac = x - ip;
  if (x >= 0) {
    if (frac === 0.5) return ip & 1 ? ip + 1 : ip;
    return Math.floor(x + 0.5);
  }
  if (frac === -0.5) return ip & 1 ? ip - 1 : ip;
  return Math.trunc(x - 0.5);
}
const netRoundInt = (x: number): number => (Number.isFinite(netRound(x)) ? netRound(x) : -(2 ** 31));
const approximately = (a: number, b: number): boolean => {
  const fa = f(a);
  const fb = f(b);
  const m = Math.max(Math.abs(fa), Math.abs(fb));
  const tolerance = Math.max(f(m * f(1e-6)), f(f(1.401298e-45) * f(8)));
  return Math.abs(f(fb - fa)) < tolerance;
};

export function judgementTypeOf(op: number, critical: boolean): number {
  if (op === 0 || op === 21) return op;
  if (op === 1) return critical ? 2 : 1;
  if (op === 20) return critical ? 15 : 10;
  if (op === 22) return 11;
  if (op === 40 || op === 41 || op === 42 || op === 102) return 5;
  if ([60, 61, 63, 104, 105, 120].includes(op)) return 21;
  if (op === 62) return 22;
  return 1;
}

interface SsNote {
  type: number;
  t: number;
  pos: number;
  posAuto: boolean;
  size: number;
  crit: boolean;
  dir: number;
  easeL: number;
  easeR: number;
  visible: boolean;
  node: SsNote[] | null;
}

const toInt = (value: unknown): number => {
  if (typeof value === "boolean") return Number(value);
  if (typeof value === "number") return Number.isInteger(value) ? value : netRoundInt(value);
  return Number.parseInt(String(value).trim(), 10);
};
const toF32 = (value: unknown): number => f(Number(value));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function readNote(raw: Record<string, unknown>): SsNote {
  const note: SsNote = {
    type: 0,
    t: 0,
    pos: 0,
    posAuto: false,
    size: f(6),
    crit: false,
    dir: 0,
    easeL: 0,
    easeR: 0,
    visible: true,
    node: null,
  };
  if (typeof raw.type === "string") note.type = NOTE_TYPES[raw.type] ?? 0;
  if (raw.t !== undefined && raw.t !== null) note.t = toInt(raw.t);
  if (raw.pos !== undefined && raw.pos !== null) {
    if (raw.pos === "auto") note.posAuto = true;
    else note.pos = toF32(raw.pos);
  }
  if (raw.size !== undefined && raw.size !== null) note.size = toF32(raw.size);
  if (raw.crit !== undefined && raw.crit !== null) note.crit = Boolean(raw.crit);
  if (typeof raw.dir === "string") note.dir = FLICK_DIRS[raw.dir] ?? 0;
  if (raw.ease !== undefined && raw.ease !== null) {
    if (Array.isArray(raw.ease)) {
      note.easeL = EASES[String(raw.ease[0])] ?? 0;
      note.easeR = EASES[String(raw.ease[1])] ?? 0;
    } else {
      note.easeL = note.easeR = EASES[String(raw.ease)] ?? 0;
    }
  }
  if (raw.visible !== undefined && raw.visible !== null) note.visible = Boolean(raw.visible);
  if (Array.isArray(raw.node)) {
    note.node = raw.node.filter(isRecord).map((child) => readNote(child));
  }
  return note;
}

interface BarPos {
  bar: number;
  rhythm: number;
  unit: number;
  progress: number;
}

class TickConverter {
  sig: [number, number, number][] = [];
  bpm: [number, number, number][] = [];
  constructor(sigs: [number, number, number][], bpms: [number, number][]) {
    const s = [...sigs].sort((a, b) => a[0] - b[0]);
    if (!s.length || s[0]![0] > 0) this.sig.push([0, 0, 1920]);
    let bar = 0;
    let previous = 0;
    let perMeasure = 1920;
    for (const [t, num, den] of s) {
      const q = perMeasure !== 0 ? Math.trunc((t - previous) / perMeasure) : 0;
      if (t - previous !== 0 && previous <= t) bar += q;
      perMeasure = den !== 0 ? Math.trunc((num * 1920) / den) : 0;
      this.sig.push([t, bar, perMeasure]);
      previous = t;
    }
    const b = [...bpms].sort((a, c) => a[0] - c[0]);
    if (!b.length || b[0]![0] > 0) this.bpm.push([0, 0, f(120)]);
    let acc = 0;
    let prevT = 0;
    let prevBpm = f(120);
    for (const [t, value] of b) {
      if (t - prevT !== 0 && prevT <= t) acc += ((t - prevT) * 60000) / f(prevBpm * f(480));
      this.bpm.push([t, netRoundInt(acc), value]);
      prevT = t;
      prevBpm = value;
    }
  }
  private find<T extends readonly number[]>(segments: T[], tick: number): T {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i]![0]! <= tick) return segments[i]!;
    }
    return segments[0]!;
  }
  timeMs(tick: number): number {
    const [t0, ms0, bpm] = this.find(this.bpm, tick);
    return Math.floor(((tick - t0) * 60000) / f(bpm * f(480)) + ms0);
  }
  barPosition(tick: number): BarPos {
    const [t0, bar0, perMeasure] = this.find(this.sig, tick);
    const q = perMeasure !== 0 ? Math.trunc((tick - t0) / perMeasure) : 0;
    const r = tick - t0 - q * perMeasure;
    return { bar: bar0 + q, rhythm: r, unit: perMeasure, progress: f(f(r) / f(perMeasure)) };
  }
}

interface Pos extends BarPos {
  ms: number;
}
const keyOf = (pos: { bar: number; progress: number }): number => f(pos.progress + f(pos.bar));
const before = (pos: Pos, bar: number, progress: number): boolean =>
  pos.bar < bar || (pos.bar === bar && pos.progress < progress);
const makePosition = (tick: number, tc: TickConverter): Pos => ({ ...tc.barPosition(tick), ms: tc.timeMs(tick) });

function timeMsFromBar(bar: number, progress: number, bpmEvents: [number, Pos][], barEvents: [number, Pos][]): number {
  const fp = f(progress);
  let ref: Pos = { bar: 0, rhythm: 0, unit: 0, progress: 0, ms: 0 };
  let beats = f(4);
  for (const [value, pos] of barEvents) {
    if (before(pos, bar, fp)) {
      beats = value;
      if (pos.ms > ref.ms) ref = pos;
    }
  }
  let bpm = f(160);
  for (const [value, pos] of bpmEvents) {
    if (before(pos, bar, fp)) {
      bpm = value;
      if (pos.ms > ref.ms) ref = pos;
    }
  }
  const spb = f(f(beats * f(60)) / bpm);
  let x = f(f(spb * f(bar - ref.bar)) + f(spb * f(fp - ref.progress)));
  x = f(x * f(1000));
  return ref.ms + Math.floor(x);
}

function barRhythm(bar: number, barEvents: [number, Pos][]): number {
  let value = f(4);
  for (const [beats, pos] of barEvents) {
    if (bar < pos.bar) return value;
    value = beats;
  }
  return value;
}

function bpmAtMs(ms: number, bpmEvents: [number, Pos][]): number {
  let value = f(160);
  for (const [bpm, pos] of bpmEvents) {
    if (pos.ms <= ms) value = bpm;
  }
  return value;
}

const samePosition = (a: Pos, b: Pos): boolean => a.bar === b.bar && approximately(a.progress, b.progress);
function ease(t: number, kind: number): number {
  const ft = f(t);
  if (kind === 0) return ft;
  if (kind === 2) return f(ft * ft);
  return f(f(f(2) - ft) * ft);
}
const convertEase = (e: number): number => (e === 1 ? 2 : e === 2 ? 1 : 0);
const overlapKey = (t: number, pos: number, size: number): string => `${t}|${netRoundInt(pos)}|${netRoundInt(size)}`;

interface NoteInfo extends BarPos {
  lane: number;
  width: number;
  op: number;
  slideAlong: boolean;
  crit: boolean;
  direction: number;
  ease: number;
  easeR: number;
  lines: number[];
}

const flickDirection = (note: SsNote): number => (note.dir === 1 ? 1 : note.dir === 2 ? 2 : 0);
function singleInfo(note: SsNote, tc: TickConverter): NoteInfo {
  const bp = tc.barPosition(note.t);
  const op = note.type === 1 ? 40 : note.type === 2 ? 60 : 1;
  return {
    ...bp,
    lane: netRoundInt(f(note.pos)),
    width: Math.max(1, netRoundInt(note.size)),
    op,
    slideAlong: false,
    crit: note.crit,
    direction: note.type === 1 ? flickDirection(note) : 0,
    ease: 0,
    easeR: 0,
    lines: [],
  };
}

function longNodeOp(nodes: SsNote[], i: number): number {
  const node = nodes[i]!;
  if (i === 0) return !node.visible ? 80 : node.type === 1 ? 41 : node.type === 2 ? 61 : 20;
  if (i === nodes.length - 1) return !node.visible ? 82 : node.type === 1 ? 42 : node.type === 2 ? 62 : 22;
  if (node.posAuto) return 21;
  if (!node.visible) return 122;
  return node.type === 2 ? 63 : 21;
}

function guideNodeOp(nodes: SsNote[], i: number, guideMap: Map<string, SsNote> | null): number {
  const node = nodes[i]!;
  if (i === 0) {
    if (guideMap && !node.posAuto) {
      const single = guideMap.get(overlapKey(node.t, node.pos, node.size));
      if (single && single.type < 3) return [101, 102, 104][single.type]!;
    }
    return 100;
  }
  if (i === nodes.length - 1) return !node.visible ? 103 : node.type === 2 ? 105 : 103;
  if (node.posAuto) return 63;
  return !node.visible ? 122 : 63;
}

class LineIndexAssigner {
  private inUse: [number, number][] = [];
  acquire(startTick: number): number {
    for (let i = this.inUse.length - 1; i >= 0; i--) {
      if (this.inUse[i]![1] < startTick) this.inUse.splice(i, 1);
    }
    const used = new Set(this.inUse.map(([index]) => index));
    for (let i = 0; i < MAX_LINES; i++) {
      if (!used.has(i)) return i;
    }
    throw new Error(`ss lineIndex ${MAX_LINES} startTick ${startTick}`);
  }
  register(index: number, endTick: number): void {
    this.inUse.push([index, endTick]);
  }
}

function lineInfos(
  chains: SsNote[],
  isLong: boolean,
  tc: TickConverter,
  out: NoteInfo[],
  guideMap: Map<string, SsNote> | null,
  assigner: LineIndexAssigner,
): void {
  for (const chain of chains) {
    const nodes = chain.node!;
    const n = nodes.length;
    const lineIndex = assigner.acquire(nodes[0]!.t);
    const endTick = nodes[n - 1]!.t;
    nodes.forEach((node, i) => {
      const op = isLong ? longNodeOp(nodes, i) : guideNodeOp(nodes, i, guideMap);
      let pos: number;
      let size: number;
      if (!node.posAuto) {
        pos = node.pos;
        size = node.size;
      } else if (i === 0 || i >= n - 1) {
        pos = nodes[0]!.pos;
        size = nodes[0]!.size;
      } else {
        let j = i;
        for (;;) {
          if (j < 2) {
            j = 0;
            break;
          }
          j--;
          if (!nodes[j]!.posAuto) break;
        }
        let k = i + 1;
        while (k < n - 1 && nodes[k]!.posAuto) k++;
        const a = nodes[j]!;
        const b = nodes[k]!;
        const span = b.t - a.t;
        const progress = span < 1 ? 0 : f(f(node.t - a.t) / f(span));
        const el = ease(progress, convertEase(a.easeL));
        const er = ease(progress, convertEase(a.easeR));
        pos = f(a.pos + f(el * f(b.pos - a.pos)));
        const aRight = f(a.pos + a.size);
        const right = f(aRight + f(er * f(f(b.pos + b.size) - aRight)));
        size = f(right - pos);
      }
      let directionSource = node;
      if (guideMap && i === 0 && !isLong && !node.posAuto) {
        directionSource = guideMap.get(overlapKey(node.t, node.pos, node.size)) ?? node;
      }
      out.push({
        ...tc.barPosition(node.t),
        lane: netRoundInt(f(pos)),
        width: Math.max(1, netRoundInt(size)),
        op,
        slideAlong: node.posAuto,
        crit: node.crit,
        direction: directionSource.type === 1 ? flickDirection(directionSource) : 0,
        ease: convertEase(node.easeL),
        easeR: convertEase(node.easeR),
        lines: [lineIndex],
      });
    });
    assigner.register(lineIndex, endTick);
  }
}

function buildNoteInfos(notes: SsNote[], tc: TickConverter): NoteInfo[] {
  const guideStarts = new Set<string>();
  for (const note of notes) {
    if (note.type === 4 && note.node?.length) {
      const first = note.node[0]!;
      if (!first.posAuto) guideStarts.add(overlapKey(first.t, first.pos, first.size));
    }
  }
  const guideMap = new Map<string, SsNote>();
  const merged = new Set<number>();
  notes.forEach((note, i) => {
    if (note.type < 3) {
      const key = overlapKey(note.t, note.pos, note.size);
      if (guideStarts.has(key) && !guideMap.has(key)) {
        guideMap.set(key, note);
        merged.add(i);
      }
    }
  });
  const out: NoteInfo[] = [];
  notes.forEach((note, i) => {
    if (!merged.has(i) && note.type < 3) out.push(singleInfo(note, tc));
  });
  const ordered = (type: number) =>
    notes
      .map((note, index) => ({ note, index }))
      .filter(({ note }) => note.type === type && (note.node?.length ?? 0) > 1)
      .sort((a, b) => a.note.node![0]!.t - b.note.node![0]!.t || a.index - b.index)
      .map(({ note }) => note);
  const assigner = new LineIndexAssigner();
  lineInfos(ordered(3), true, tc, out, null, assigner);
  lineInfos(ordered(4), false, tc, out, guideMap, assigner);
  return out;
}

function infoDictionary(infos: NoteInfo[]): Map<number, Map<number, NoteInfo[]>> {
  const dictionary = new Map<number, Map<number, NoteInfo[]>>();
  for (const info of infos) {
    const key = keyOf(info);
    let lanes = dictionary.get(key);
    if (!lanes) dictionary.set(key, (lanes = new Map()));
    let list = lanes.get(info.lane);
    if (!list) lanes.set(info.lane, (list = []));
    if (MERGEABLE.has(info.op) && info.lines.length) {
      const hit = list.find(
        (e) =>
          e.op === info.op
          && e.width === info.width
          && e.crit === info.crit
          && e.direction === info.direction
          && e.ease === info.ease
          && e.easeR === info.easeR,
      );
      if (hit) {
        hit.lines.push(...info.lines);
        continue;
      }
    }
    list.push(info);
  }
  return dictionary;
}

const priority = (op: number): number => ([20, 41, 61, 80, 100, 101, 102, 104].includes(op) ? 8 : op === 122 ? 9 : 10);

interface RuntimeNote {
  id: number;
  pos: Pos;
  op: number;
  crit: boolean;
  slideAlong: boolean;
  lineIds: number[];
  viewNotes: RuntimeNote[];
  comboNotes: RuntimeNote[];
  endCombo: RuntimeNote[];
}

function* eighths(segStart: Pos, segEnd: Pos, bpmEvents: [number, Pos][], barEvents: [number, Pos][]): Generator<Pos> {
  let bar = segStart.bar;
  let progress = segStart.progress;
  let r = barRhythm(bar, barEvents);
  let step = 1 / (r + r);
  for (;;) {
    progress += step;
    if (progress >= 1) {
      bar += 1;
      progress -= 1;
      r = barRhythm(bar, barEvents);
      step = 1 / (r + r);
    }
    const fp = f(progress);
    const ms = timeMsFromBar(bar, fp, bpmEvents, barEvents);
    if (segEnd.ms <= ms) return;
    const r2 = barRhythm(bar, barEvents);
    const unit = Math.trunc(f(r2 + r2));
    yield { bar, rhythm: netRoundInt(f(fp * f(unit))), unit, progress: fp, ms };
  }
}

export function runtimeChart(root: unknown): RuntimeChartTimingSource {
  const score = isRecord(root) && isRecord(root.score) ? root.score : null;
  if (!score) throw new Error("ss score");
  const events = isRecord(score.events) ? score.events : {};
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const bpm = list(events.bpm)
    .filter(isRecord)
    .map((b) => [toInt(b.t), toF32(b.bpm)] as [number, number]);
  const sig = list(events.sig)
    .filter(isRecord)
    .filter((s) => Array.isArray(s.sig) && s.sig.length >= 2)
    .map((s) => {
      const pair = s.sig as unknown[];
      return [toInt(s.t), toInt(pair[0]), toInt(pair[1])] as [number, number, number];
    });
  const fever = list(events.fever)
    .filter((pair): pair is unknown[] => Array.isArray(pair) && pair.length >= 2)
    .map((pair) => [toInt(pair[0]), toInt(pair[1])] as [number, number]);
  const notes = list(score.notes).filter(isRecord).map((note) => readNote(note));
  const tc = new TickConverter(sig, bpm);
  const infos = buildNoteInfos(notes, tc);
  const bpmEvents = [...bpm].sort((a, b) => a[0] - b[0]).map(([t, value]) => [value, makePosition(t, tc)] as [number, Pos]);
  const barEvents = [...sig]
    .sort((a, b) => a[0] - b[0])
    .map(([t, num, den]) => [f(f(f(num) * f(4)) / f(den)), makePosition(t, tc)] as [number, Pos]);
  const fevers = [...fever].sort((a, b) => a[0] - b[0]).map(([a, b]) => [makePosition(a, tc), makePosition(b, tc)] as const);

  let currentId = 0;
  let currentLine = 0;
  let currentGuideLine = 0;
  const beginByLine = new Map<number, RuntimeNote>();
  const lineArr = new Array<number>(MAX_LINES).fill(-1);
  const guideArr = new Array<number>(MAX_LINES).fill(-1);
  const make = (info: NoteInfo, pos: Pos, op: number, lineIds: number[]): RuntimeNote => ({
    id: currentId,
    pos,
    op,
    crit: info.crit,
    slideAlong: info.slideAlong,
    lineIds,
    viewNotes: [],
    comboNotes: [],
    endCombo: [],
  });
  const endLine = (end: RuntimeNote) => {
    const begins: RuntimeNote[] = [];
    let ok = true;
    for (const lineId of end.lineIds) {
      const begin = beginByLine.get(lineId);
      if (!begin) {
        ok = false;
        break;
      }
      begins.push(begin);
      const lineNotes = begin.viewNotes
        .filter((note) => note.lineIds.includes(lineId))
        .sort((a, b) => a.pos.bar - b.pos.bar || a.pos.progress - b.pos.progress);
      lineNotes.push(end);
      const mids = lineNotes.filter((note) => note !== end && isJudgementNote(note.op)).map((note) => note.pos);
      const bounds = [begin.pos, ...mids, end.pos];
      const beats: Pos[] = [];
      for (let s = 0; s < bounds.length - 1; s++) beats.push(...eighths(bounds[s]!, bounds[s + 1]!, bpmEvents, barEvents));
      beats.forEach((beat, k) => {
        if (lineNotes.some((note) => isJudgementNote(note.op) && samePosition(note.pos, beat))) return;
        const win = 15000 / bpmAtMs(beat.ms, bpmEvents);
        let skip = mids.some((mid) => mid.ms - win <= beat.ms && beat.ms < mid.ms);
        if (k === 0 && win > beat.ms - begin.pos.ms) skip = true;
        if (k === beats.length - 1 && win > end.pos.ms - beat.ms) skip = true;
        const combo: RuntimeNote = {
          id: lineId + k * 10000 + 10000,
          pos: beat,
          op: skip ? 121 : 120,
          crit: false,
          slideAlong: false,
          lineIds: [lineId],
          viewNotes: [],
          comboNotes: [],
          endCombo: [],
        };
        if (SLIDE_BEGIN_CLASS.has(begin.op)) begin.comboNotes.push(combo);
      });
      beginByLine.delete(lineId);
    }
    if (ok) {
      for (const begin of begins) {
        if (SLIDE_END_CLASS.has(end.op) && SLIDE_BEGIN_CLASS.has(begin.op)) end.endCombo.push(...begin.comboNotes);
      }
    }
  };
  const create = (info: NoteInfo): RuntimeNote | null => {
    const ms = timeMsFromBar(info.bar, info.progress, bpmEvents, barEvents);
    const pos: Pos = { bar: info.bar, rhythm: info.rhythm, unit: info.unit, progress: info.progress, ms };
    currentId++;
    const op = info.op;
    let note: RuntimeNote;
    if (op === 1 || op === 40 || op === 60) {
      note = make(info, pos, op, []);
    } else if (op === 20 || op === 41 || op === 61 || op === 80) {
      const ids = info.lines.map((index) => {
        currentLine++;
        lineArr[index] = currentLine;
        return currentLine;
      });
      note = make(info, pos, op, ids);
      for (const id of ids) beginByLine.set(id, note);
    } else if (op === 21 || op === 63) {
      const id = (op === 21 ? lineArr : guideArr)[info.lines[0]!]!;
      note = make(info, pos, op, [id]);
      beginByLine.get(id)?.viewNotes.push(note);
    } else if (op === 22 || op === 42 || op === 62 || op === 82) {
      const ids = info.lines.map((index) => {
        const id = lineArr[index]!;
        lineArr[index] = -1;
        return id;
      });
      note = make(info, pos, op, ids);
      endLine(note);
    } else if (op === 100 || op === 101 || op === 102 || op === 104) {
      const ids = info.lines.map((index) => {
        const id = currentGuideLine + 10001;
        currentGuideLine++;
        guideArr[index] = id;
        return id;
      });
      note = make(info, pos, op, ids);
      for (const id of ids) beginByLine.set(id, note);
    } else if (op === 103 || op === 105) {
      const ids = info.lines.map((index) => {
        const id = guideArr[index]!;
        guideArr[index] = -1;
        return id;
      });
      note = make(info, pos, op, ids);
      endLine(note);
    } else if (op === 122) {
      let id = lineArr[info.lines[0]!]!;
      if (id < 1) {
        id = guideArr[info.lines[0]!]!;
        if (id < 1) return null;
      }
      note = make(info, pos, op, [id]);
      beginByLine.get(id)?.viewNotes.push(note);
    } else {
      return null;
    }
    return note;
  };

  const dictionary = infoDictionary(infos);
  const byKey = new Map<number, RuntimeNote[]>();
  for (const key of [...dictionary.keys()].sort((a, b) => a - b)) {
    const flat = [...dictionary.get(key)!.values()].flat();
    flat.sort((a, b) => priority(a.op) - priority(b.op));
    for (const info of flat) {
      const note = create(info);
      if (!note) continue;
      const noteKey = keyOf(note.pos);
      const listAt = byKey.get(noteKey) ?? [];
      listAt.push(note);
      byKey.set(noteKey, listAt);
      if (SLIDE_END_CLASS.has(note.op) && note.endCombo.length) {
        for (const combo of note.endCombo) {
          const comboKey = keyOf(combo.pos);
          const comboList = byKey.get(comboKey) ?? [];
          if (!comboList.includes(combo)) comboList.push(combo);
          byKey.set(comboKey, comboList);
        }
      }
    }
  }
  const enumeration = [...byKey.values()].flat();
  return {
    feverMs: fevers.map(([start, end]) => [start.ms, end.ms] as const),
    enumeration: enumeration.map((note) => ({
      op: note.op,
      timeMs: note.pos.ms,
      judgementType: note.op === 123 ? 0 : judgementTypeOf(note.op, note.crit),
    })),
  };
}

export async function runtimeChartFromBytes(bytes: Uint8Array): Promise<RuntimeChartTimingSource> {
  let data = bytes;
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    data = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return runtimeChart(JSON.parse(new TextDecoder().decode(data)));
}

export async function gekisoTimingFromBytes(
  bytes: Uint8Array,
  timings: readonly (RawLiveJudgementTiming | PerfectTimingEntry)[],
): Promise<GekisoTimingSegment[]> {
  const source = await runtimeChartFromBytes(bytes);
  return gekisoTiming(source, perfectTimingsMap(timings));
}

/**
 * Native score-to-deck-chart converter (`SsMusicScoreConverter -> MusicScoreNoteCreator`), matching Haneoka's
 * `ournotes-team-builder` `runtime_chart::convert` in binary32 / .NET midpoint-to-even precision so newly exported
 * `moenotes-assets` score JSON files (`Live/MusicScore/<chartKey>/<score>.json`) can hydrate missing `DeckChart` rows
 * immediately without waiting for an offline `nnnotes` replay bundle rebuild.
 */

export interface OverlayDeckNoteInput {
  judgementAreaOffsetType: number;
  lane: number;
  width: number;
  direction: number;
  ease: number;
  easeRight: number;
  lines: number[];
}

export interface OverlayDeckChart {
  scoreId: number;
  durationMs: number;
  notes: {
    id: number[];
    op: number[];
    judgementType: number[];
    timeMs: number[];
  };
  inputs: OverlayDeckNoteInput[];
  enumeration: {
    op: number[];
    judgementType: number[];
    timeMs: number[];
  };
  skillEvents: { timeMs: number[] };
  fevers: { startMs: number[]; endMs: number[] };
}

const f = Math.fround;
const MAX_LINES = 20;
const UNJUDGED = new Set([0, 80, 82, 100, 103, 121, 122, 123]);
const SLIDE_BEGIN_CLASS = new Set([20, 41, 61, 80, 104]);
const SLIDE_END_CLASS = new Set([22, 42, 62, 82, 105]);
const MERGEABLE = new Set([20, 22, 41, 42, 61, 62, 80, 82, 100, 101, 102, 103, 104, 105]);
const NOTE_TYPES: Readonly<Record<string, number>> = { tap: 0, flick: 1, trace: 2, long: 3, guide: 4, node: 5 };
const FLICK_DIRS: Readonly<Record<string, number>> = { up: 0, left: 1, right: 2, down: 3 };
const EASES: Readonly<Record<string, number>> = { linear: 0, in: 1, out: 2 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJudgedOp(op: number): boolean {
  return !UNJUDGED.has(op);
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

function netRoundInt(x: number): number {
  const r = netRound(x);
  return Number.isFinite(r) ? r : -(2 ** 31);
}

function approximately(a: number, b: number): boolean {
  const fa = f(a);
  const fb = f(b);
  const m = Math.max(Math.abs(fa), Math.abs(fb));
  const tolerance = Math.max(f(m * f(1e-6)), f(f(1.401298e-45) * f(8)));
  return Math.abs(f(fb - fa)) < tolerance;
}

function judgementTypeOf(op: number, critical: boolean): number {
  if (op === 0 || op === 21) return op;
  if (op === 1) return critical ? 2 : 1;
  if (op === 20) return critical ? 15 : 10;
  if (op === 22) return 11;
  if (op === 40 || op === 41 || op === 42 || op === 102) return 5;
  if (op === 60 || op === 61 || op === 63 || op === 104 || op === 105 || op === 120) return 21;
  if (op === 62) return 22;
  if (op === 123) return 0;
  return 1;
}

function judgementAreaOffsetTypeOf(op: number, critical: boolean): number {
  if (op === 1) return critical ? 8 : 0;
  if (op === 20) return critical ? 9 : 2;
  if (op === 21 || op === 120 || op === 121) return 1;
  if (op === 22) return 3;
  if (op >= 40 && op <= 42) return 4;
  if ((op >= 60 && op <= 63) || op === 80 || op === 82 || op === 104 || op === 105) return 5;
  return 0;
}

function toInt(value: unknown): number {
  if (typeof value === "boolean") return Number(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return Number.isInteger(value) ? value : netRoundInt(value);
  }
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toF32(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "boolean") return f(Number(value));
  return f(Number(value));
}

function toTruth(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0;
  return true;
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
  if (raw.crit !== undefined && raw.crit !== null) note.crit = toTruth(raw.crit);
  if (typeof raw.dir === "string") note.dir = FLICK_DIRS[raw.dir] ?? 0;
  if (raw.ease !== undefined && raw.ease !== null) {
    if (Array.isArray(raw.ease)) {
      note.easeL = EASES[String(raw.ease[0])] ?? 0;
      note.easeR = EASES[String(raw.ease[1])] ?? 0;
    } else {
      note.easeL = note.easeR = EASES[String(raw.ease)] ?? 0;
    }
  }
  if (raw.visible !== undefined && raw.visible !== null) note.visible = toTruth(raw.visible);
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

interface Pos extends BarPos {
  ms: number;
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
          e.op === info.op &&
          e.width === info.width &&
          e.crit === info.crit &&
          e.direction === info.direction &&
          e.ease === info.ease &&
          e.easeR === info.easeR,
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
  lane: number;
  width: number;
  direction: number;
  ease: number;
  easeRight: number;
  lineIds: number[];
  viewNotes: RuntimeNote[];
  comboNotes: RuntimeNote[];
  endCombo: RuntimeNote[];
}

function lineShape(begin: RuntimeNote, points: readonly RuntimeNote[], at: Pos): readonly [number, number] {
  let previous = begin;
  const atKey = keyOf(at);
  for (const next of points) {
    const nextKey = keyOf(next.pos);
    if (nextKey < atKey) {
      previous = next;
      continue;
    }
    const prevKey = keyOf(previous.pos);
    const span = f(nextKey - prevKey);
    const t = span > 0 ? f(f(atKey - prevKey) / span) : 0;
    const left = f(previous.lane + f(ease(t, previous.ease) * f(next.lane - previous.lane)));
    const rightA = f(previous.lane + previous.width);
    const rightB = f(next.lane + next.width);
    const right = f(rightA + f(ease(t, previous.easeRight) * f(rightB - rightA)));
    return [left, f(right - left)];
  }
  return [previous.lane, previous.width];
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

/**
 * Convert a decoded `Live/MusicScore/<chartKey>/<score>.json` object into a validated `OverlayDeckChart`.
 * Throws when the input is malformed or unplayable (no judged notes, non-positive duration, or != 5 skill events).
 */
export function convertRawScoreToDeckChart(scoreId: number, root: unknown): OverlayDeckChart {
  if (!Number.isSafeInteger(scoreId) || scoreId <= 0) {
    throw new Error(`Invalid scoreId: ${String(scoreId)}`);
  }
  const score = isRecord(root) && isRecord(root.score) ? root.score : null;
  if (!score) throw new Error("Missing score container");
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
  const skill = list(events.skill).map(toInt);
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
  const skillTimesMs = skill.map((tick) => makePosition(tick, tc).ms);

  if (skillTimesMs.length !== 5 || skillTimesMs.some((t) => !Number.isSafeInteger(t) || t < 0)) {
    throw new Error(`Unsupported skill event schedule (${skillTimesMs.length})`);
  }

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
    lane: info.lane,
    width: info.width,
    direction: info.direction,
    ease: info.ease,
    easeRight: info.easeR,
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
      const mids = lineNotes.filter((note) => note !== end && isJudgedOp(note.op)).map((note) => note.pos);
      const bounds = [begin.pos, ...mids, end.pos];
      const beats: Pos[] = [];
      for (let s = 0; s < bounds.length - 1; s++) {
        beats.push(...eighths(bounds[s]!, bounds[s + 1]!, bpmEvents, barEvents));
      }
      beats.forEach((beat, k) => {
        if (lineNotes.some((note) => isJudgedOp(note.op) && samePosition(note.pos, beat))) return;
        const win = 15000 / bpmAtMs(beat.ms, bpmEvents);
        let skip = mids.some((mid) => mid.ms - win <= beat.ms && beat.ms < mid.ms);
        if (k === 0 && win > beat.ms - begin.pos.ms) skip = true;
        if (k === beats.length - 1 && win > end.pos.ms - beat.ms) skip = true;
        const [lane, width] = lineShape(begin, lineNotes, beat);
        const combo: RuntimeNote = {
          id: lineId + k * 10000 + 10000,
          pos: beat,
          op: skip ? 121 : 120,
          crit: false,
          lane,
          width,
          direction: 0,
          ease: 0,
          easeRight: 0,
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
        if (SLIDE_END_CLASS.has(end.op) && SLIDE_BEGIN_CLASS.has(begin.op)) {
          end.endCombo.push(...begin.comboNotes);
        }
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

  const enumerationNotes = [...byKey.values()].flat();
  const positional = [...byKey.keys()].sort((a, b) => a - b).flatMap((key) => byKey.get(key)!);
  const maxPosMs = positional.reduce((max, note) => (note.pos.ms > max ? note.pos.ms : max), 0);
  const durationMs = Math.max(0, maxPosMs) + 1000;
  const chronological = [...positional].sort((a, b) => a.pos.ms - b.pos.ms);

  let judgedCount = 0;
  for (const note of chronological) {
    if (isJudgedOp(note.op)) {
      if (note.pos.ms < 0) throw new Error("Negative judged note timestamp");
      judgedCount++;
    }
  }
  if (durationMs <= 0 || judgedCount === 0) {
    throw new Error("Chart contains no playable judged notes");
  }

  return {
    scoreId,
    durationMs,
    notes: {
      id: chronological.map((note) => note.id),
      op: chronological.map((note) => note.op),
      judgementType: chronological.map((note) => judgementTypeOf(note.op, note.crit)),
      timeMs: chronological.map((note) => note.pos.ms),
    },
    inputs: chronological.map((note) => ({
      judgementAreaOffsetType: judgementAreaOffsetTypeOf(note.op, note.crit),
      lane: note.lane,
      width: note.width,
      direction: note.direction,
      ease: note.ease,
      easeRight: note.easeRight,
      lines: [...note.lineIds],
    })),
    enumeration: {
      op: enumerationNotes.map((note) => note.op),
      judgementType: enumerationNotes.map((note) => judgementTypeOf(note.op, note.crit)),
      timeMs: enumerationNotes.map((note) => note.pos.ms),
    },
    skillEvents: { timeMs: skillTimesMs },
    fevers: {
      startMs: fevers.map(([start]) => start.ms),
      endMs: fevers.map(([, end]) => end.ms),
    },
  };
}

/** Decode plain UTF-8 or gzipped score JSON bytes and convert to `OverlayDeckChart`. */
export async function convertRawScoreBytesToDeckChart(scoreId: number, bytes: Uint8Array): Promise<OverlayDeckChart> {
  let data = bytes;
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    data = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return convertRawScoreToDeckChart(scoreId, JSON.parse(new TextDecoder().decode(data)));
}

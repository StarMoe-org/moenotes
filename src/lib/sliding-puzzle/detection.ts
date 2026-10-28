import { puzzlePixelBytes, type PuzzlePixelImage } from "./features";
import { assertPuzzleSize, type PuzzleSize } from "./model";
import type { PixelRect } from "./sampling";

export interface PuzzleRegionCandidate {
  readonly crop: PixelRect;
  /** Geometry evidence, never a probability or an approved board. */
  readonly score: number;
  readonly evidence: "artwork" | "grid" | "weakGrid";
}
export interface PuzzleRegionSuggestions {
  readonly reviewRequired: true;
  readonly candidates: readonly PuzzleRegionCandidate[];
}

const MAX_EDGE = 1280;
interface AxisRange { start: number; end: number; score: number }
interface EdgeMap { width: number; height: number; vertical: Float32Array; horizontal: Float32Array; x: number[]; y: number[] }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Bounded image plane; alpha is composed over neutral gray, as in fragment matching.
 * Integer box bins avoid the sampling-phase ripples that fake periodic seams on textured images.
 */
function edgeMap(image: PuzzlePixelImage): EdgeMap {
  const bytes = puzzlePixelBytes(image), block = Math.max(1, Math.ceil(Math.max(image.width, image.height) / MAX_EDGE));
  const width = Math.max(1, Math.floor(image.width / block)), height = Math.max(1, Math.floor(image.height / block));
  const rgb = new Float32Array(width * height * 3), counts = new Float32Array(width * height);
  for (let sy = 0; sy < image.height; sy++) for (let sx = 0; sx < image.width; sx++) {
    const x = Math.min(width - 1, Math.floor(sx / block)), y = Math.min(height - 1, Math.floor(sy / block));
    const p = (sy * image.width + sx) * 4, alpha = bytes[p + 3]! / 255;
    for (let c = 0; c < 3; c++) rgb[(y * width + x) * 3 + c]! += bytes[p + c]! / 255 * alpha + 0.5 * (1 - alpha);
    counts[y * width + x]! += 1;
  }
  for (let i = 0; i < width * height; i++) if (counts[i]! > 1) for (let c = 0; c < 3; c++) rgb[i * 3 + c]! /= counts[i]!;
  const stride = width + 1, vertical = new Float32Array(stride * (height + 1)), horizontal = new Float32Array(stride * (height + 1));
  const xp = new Array<number>(width + 1).fill(0), yp = new Array<number>(height + 1).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let dx = 0, dy = 0;
    for (let c = 0; c < 3; c++) {
      const p = (y * width + x) * 3 + c;
      if (x) dx += Math.abs(rgb[p]! - rgb[p - 3]!)/3;
      if (y) dy += Math.abs(rgb[p]! - rgb[p - width * 3]!)/3;
    }
    const p = (y + 1) * stride + x + 1;
    vertical[p] = vertical[p - stride]! + dx;
    horizontal[p] = horizontal[p - 1]! + dy;
    xp[x]! += dx / height; yp[y]! += dy / width;
  }
  // The first column/row has no backward neighbour and would fake a boundary seam.
  if (width > 1) xp[0] = xp[1]!;
  if (height > 1) yp[0] = yp[1]!;
  return { width, height, vertical, horizontal, x: xp, y: yp };
}

function prominence(at: number, length: number, sample: (position: number) => number): number {
  const p = Math.round(at);
  if (p <= 3 || p >= length - 3) return 0;
  // A seam is a dark band: its gradient peaks sit on both rims, so sample a small plateau window.
  const peak = Math.max(sample(p - 3), sample(p - 2), sample(p - 1), sample(p), sample(p + 1), sample(p + 2), sample(p + 3));
  const baseline = [p - 9, p - 8, p + 8, p + 9].filter(i => i >= 0 && i < length).map(sample);
  const average = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
  // A seam must rise above its own surroundings; busy or noisy image areas are not grids.
  return Math.max(0, peak - average) / (average + 0.015);
}

/** Fit equidistant line families to prominent axes, including off-image boundaries for already-cropped inputs. */
function ranges(profile: number[], size: PuzzleSize, minSide: number, maxSide: number): AxisRange[] {
  const length = profile.length - 1, strength = profile.map((_, i) => prominence(i, length, p => profile[p]!));
  const peaks: number[] = [0, length];
  for (const p of strength.map((score, position) => ({ score, position })).sort((a, b) => b.score - a.score || a.position - b.position)) {
    if (p.score < 0.001) break;
    if (peaks.every(other => Math.abs(p.position - other) > 3)) peaks.push(p.position);
    if (peaks.length >= 64) break;
  }
  peaks.sort((a,b) => a-b);
  const found = new Map<string, AxisRange>();
  for (let a = 0; a < peaks.length; a++) for (let b = a + 1; b < peaks.length; b++) {
    for (let gap = 1; gap <= size; gap++) {
      const step = (peaks[b]! - peaks[a]!) / gap, side = step * size;
      if (side < minSide || side > maxSide) continue;
      for (let first = 0; first + gap <= size; first++) {
        const start = peaks[a]! - first * step, end = start + side;
        if (start < -1 || end > length + 1) continue;
        const values = Array.from({ length: size - 1 }, (_, i) => strength[clamp(Math.round(start + (i + 1) * step), 0, length)]!);
        const score = values.reduce((sum, value) => sum + value, 0) / values.length * 0.45 + Math.min(...values) * 0.1
          + (strength[clamp(Math.round(start),0,length)]! + strength[clamp(Math.round(end),0,length)]!) * 0.225;
        if (score < 0.002) continue;
        const left = Math.round(clamp(start,0,length)), right = Math.round(clamp(end,0,length)), key = `${left}:${right}`;
        if (!found.has(key) || found.get(key)!.score < score) found.set(key, { start: left, end: right, score });
      }
    }
  }
  // A cropped board may expose no outside edge, so always evaluate the whole axis as well.
  found.set(`0:${length}`, { start: 0, end: length, score: Infinity });
  return [...found.values()].sort((a,b) => b.score-a.score || b.end-b.start-(a.end-a.start)).slice(0,56);
}

function evidence(map: EdgeMap, x: AxisRange, y: AxisRange, size: PuzzleSize): { score: number; strong: boolean } {
  const stride = map.width + 1;
  const column = (at: number) => { const p = clamp(at, 0, map.width - 1) + 1; return (map.vertical[y.end * stride + p]! - map.vertical[y.start * stride + p]!) / (y.end - y.start); };
  const row = (at: number) => { const p = clamp(at, 0, map.height - 1) + 1; return (map.horizontal[p * stride + x.end]! - map.horizontal[p * stride + x.start]!) / (x.end - x.start); };
  const vx = Array.from({ length: size - 1 }, (_, i) => prominence(x.start + (x.end - x.start) * (i + 1) / size, map.width, column));
  const vy = Array.from({ length: size - 1 }, (_, i) => prominence(y.start + (y.end - y.start) * (i + 1) / size, map.height, row));
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value,0)/values.length;
  const internal = Math.sqrt(mean(vx) * mean(vy)), weakest = Math.min(...vx,...vy);
  const border = mean([prominence(x.start,map.width,column),prominence(x.end,map.width,column),prominence(y.start,map.height,row),prominence(y.end,map.height,row)]);
  const value = internal * 0.55 + weakest * 0.2 + border * 0.25;
  return { score: value / (value + 0.25), strong: weakest > 0.5 && internal > 0.75 };
}

/** Overlap coefficient: a shifted or contained window of the same board still overlaps most of it. */
function overlap(a: PixelRect, b: PixelRect): number {
  const area = Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) * Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  return area/Math.min(a.width*a.height,b.width*b.height);
}

/** The same board shifted by whole cells keeps its size and stays near its own centre. */
function duplicate(a: PixelRect, b: PixelRect): boolean {
  const shared = overlap(a,b);
  if (shared >= 0.6) return true;
  if (shared < 0.25) return false;
  const small = Math.min(Math.min(a.width,a.height),Math.min(b.width,b.height));
  const large = Math.max(Math.min(a.width,a.height),Math.min(b.width,b.height));
  if ((large-small)/large > 0.15) return false;
  return Math.hypot(a.x+a.width/2-(b.x+b.width/2), a.y+a.height/2-(b.y+b.height/2)) <= 0.8*small;
}

/** Small centered fingerprints rank geometric proposals; final tile matching remains a separate, reviewed task. */
function fingerprint(image: PuzzlePixelImage, bytes: Uint8Array, rect: PixelRect): { texture: number[]; mean: number[] } {
  const values: number[] = [], mean = [0,0,0], side = 6;
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const sx = clamp(Math.floor(rect.x + (0.1 + 0.8*(x+0.5)/side)*rect.width),0,image.width-1);
    const sy = clamp(Math.floor(rect.y + (0.1 + 0.8*(y+0.5)/side)*rect.height),0,image.height-1), p = (sy*image.width+sx)*4, alpha=bytes[p+3]!/255;
    for (let c=0;c<3;c++) { const value = bytes[p+c]!/255*alpha+0.5*(1-alpha); values.push(value); mean[c]! += value/(side*side); }
  }
  const centered = values.map((value,i)=>value-mean[i%3]!), norm=Math.sqrt(centered.reduce((sum,value)=>sum+value*value,0));
  return { texture: centered.map(value=>norm>1e-9?value/norm:0), mean };
}
function artworkRanker(image: PuzzlePixelImage, artwork: PuzzlePixelImage, size: PuzzleSize): (crop: PixelRect) => { cost: number; unique: number } {
  const bytes = puzzlePixelBytes(image), referenceBytes = puzzlePixelBytes(artwork);
  const references = Array.from({length:size*size-1},(_,i)=>fingerprint(artwork,referenceBytes,{x:(i%size)*artwork.width/size,y:Math.floor(i/size)*artwork.height/size,width:artwork.width/size,height:artwork.height/size}));
  return crop => {
    const matches = Array.from({length:size*size},(_,i)=>{
      const observed = fingerprint(image,bytes,{x:crop.x+(i%size)*crop.width/size,y:crop.y+Math.floor(i/size)*crop.height/size,width:crop.width/size,height:crop.height/size});
      let cost=Infinity, id=-1;
      references.forEach((ref,index)=>{
        let correlation=0; for(let j=0;j<ref.texture.length;j++)correlation+=ref.texture[j]!*observed.texture[j]!;
        const color=Math.sqrt(ref.mean.reduce((sum,value,c)=>sum+(value-observed.mean[c]!)**2,0)/3);
        const next=0.9*(1-clamp(correlation,-1,1))/2+0.1*color;
        if(next<cost){cost=next;id=index;}
      });
      return {cost,id};
    }).sort((a,b)=>a.cost-b.cost).slice(0,size*size-1); // One observation may be the blank.
    const unique = new Set(matches.map(match=>match.id)).size/matches.length;
    return {cost:matches.reduce((sum,match)=>sum+match.cost,0)/matches.length+0.15*(1-unique),unique};
  };
}

/** Axis-aligned near-square candidates only. Suggestions never change a crop or approve any tile IDs. */
export function suggestPuzzleRegions(image: PuzzlePixelImage, size: PuzzleSize, artwork?: PuzzlePixelImage): PuzzleRegionSuggestions {
  assertPuzzleSize(size);
  const map = edgeMap(image), minimum = Math.max(size * 6, Math.min(map.width,map.height) * 0.16), maximum = Math.min(map.width,map.height) * 1.08;
  const xs = ranges(map.x,size,minimum,maximum), ys = ranges(map.y,size,minimum,maximum);
  const candidates: PuzzleRegionCandidate[] = [];
  for (const x of xs) for (const y of ys) {
    const ratio = (x.end-x.start)/(y.end-y.start);
    if (ratio < 0.88 || ratio > 1.14) continue;
    const measured = evidence(map,x,y,size);
    if (measured.score < 0.45) continue;
    // Sliding boards are square; a slightly wide card or panel is weaker evidence than a square grid.
    const squareness = Math.max(0, 1 - 2*Math.abs(ratio-1));
    // Ranges may touch one off-image boundary; the reported crop must still be a valid image region.
    const left = Math.max(0, Math.round(x.start*image.width/map.width)), top = Math.max(0, Math.round(y.start*image.height/map.height));
    const right = Math.min(image.width, Math.round(x.end*image.width/map.width)), bottom = Math.min(image.height, Math.round(y.end*image.height/map.height));
    const crop = Object.freeze({ x: left, y: top, width: right-left, height: bottom-top });
    if (crop.width < size || crop.height < size) continue;
    candidates.push(Object.freeze({ crop, score: measured.score*squareness, evidence: measured.strong ? "grid" : "weakGrid" }));
  }
  candidates.sort((a,b) => b.score-a.score || b.crop.width*b.crop.height-a.crop.width*a.crop.height || a.crop.y-b.crop.y || a.crop.x-b.crop.x);
  if (artwork) {
    const rank = artworkRanker(image,artwork,size);
    const ranked = candidates.slice(0,240).map(candidate=>{
      const appearance=rank(candidate.crop);
      return Object.freeze({...candidate,score:0.85*(1-appearance.cost)+0.15*candidate.score,
        evidence:appearance.cost<0.16&&appearance.unique>=0.8?"artwork" as const:"weakGrid" as const});
    });
    candidates.splice(0,candidates.length,...ranked.sort((a,b)=>b.score-a.score));
  }
  const selected: PuzzleRegionCandidate[] = [];
  for (const candidate of candidates) {
    if (selected.every(other => !duplicate(other.crop,candidate.crop))) selected.push(candidate);
    if (selected.length === 5) break;
  }
  return Object.freeze({ reviewRequired: true, candidates: Object.freeze(selected) });
}

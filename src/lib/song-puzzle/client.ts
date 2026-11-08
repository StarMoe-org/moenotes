import { assetConfig } from "@/config/assets";
import type {
  SlidePuzzleIndexItem,
  SlidePuzzleMeta,
  SlidePuzzleSolution,
  SlidePuzzleStep,
} from "./types";

let indexCache: Promise<SlidePuzzleIndexItem[]> | null = null;
const solutionCache = new Map<string, Promise<SlidePuzzleSolution | null>>();

async function fetchJsonLines(url: string, fallbackUrl?: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (res.ok) {
      return await res.text();
    }
  } catch {
    // try fallback
  }

  if (fallbackUrl && fallbackUrl !== url) {
    const fallbackRes = await fetch(fallbackUrl);
    if (fallbackRes.ok) {
      return await fallbackRes.text();
    }
  }

  throw new Error(`Failed to fetch JSONL from ${url} or fallback ${fallbackUrl ?? "none"}`);
}

export function fetchPuzzleIndex(): Promise<SlidePuzzleIndexItem[]> {
  if (indexCache) return indexCache;

  const url = `${assetConfig.slidePuzzle.site}/index.jsonl`;
  const fallbackUrl = `${assetConfig.slidePuzzle.fallbackSite}/index.jsonl`;

  indexCache = fetchJsonLines(url, fallbackUrl)
    .then((text) => {
      const lines = text.trim().split("\n");
      const items: SlidePuzzleIndexItem[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as SlidePuzzleIndexItem;
          if (typeof parsed.musicId === "number" && typeof parsed.grid === "number") {
            items.push(parsed);
          }
        } catch {
          // ignore malformed lines
        }
      }
      return items;
    })
    .catch((err) => {
      indexCache = null;
      throw err;
    });

  return indexCache;
}

export function fetchPuzzleSolution(musicId: number, grid: number): Promise<SlidePuzzleSolution | null> {
  const cacheKey = `${musicId}_${grid}`;
  const existing = solutionCache.get(cacheKey);
  if (existing) return existing;

  const fileName = `${musicId}_${grid}.jsonl`;
  const url = `${assetConfig.slidePuzzle.site}/${fileName}`;
  const fallbackUrl = `${assetConfig.slidePuzzle.fallbackSite}/${fileName}`;

  const promise = fetchJsonLines(url, fallbackUrl)
    .then((text) => {
      const lines = text.trim().split("\n");
      if (lines.length === 0) return null;

      let meta: SlidePuzzleMeta | null = null;
      const steps: SlidePuzzleStep[] = [];

      for (let i = 0; i < lines.length; i += 1) {
        const trimmed = lines[i]?.trim();
        if (!trimmed) continue;
        const parsed = JSON.parse(trimmed);
        if (parsed.type === "meta") {
          meta = parsed as SlidePuzzleMeta;
        } else if (parsed.type === "step") {
          steps.push(parsed as SlidePuzzleStep);
        }
      }

      if (!meta) return null;
      return { meta, steps };
    })
    .catch((err) => {
      solutionCache.delete(cacheKey);
      return null;
    });

  solutionCache.set(cacheKey, promise);
  return promise;
}

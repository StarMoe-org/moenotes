import { assetConfig } from "@/config/assets";
import type {
  SlidePuzzleIndexItem,
  SlidePuzzleMeta,
  SlidePuzzleSolution,
  SlidePuzzleStep,
} from "./types";

let indexCache: Promise<SlidePuzzleIndexItem[]> | null = null;
const solutionCache = new Map<string, Promise<SlidePuzzleSolution | null>>();

function getCandidateUrls(path: string): string[] {
  const candidates: string[] = [];
  const cleanPath = path.replace(/^\/+/, "");

  // In development, prefer local static files first to avoid unnecessary remote fetches
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development" && assetConfig.slidePuzzle.localSite) {
    candidates.push(`${assetConfig.slidePuzzle.localSite}/${cleanPath}`);
  }

  // Primary production source: R2 storage
  if (assetConfig.slidePuzzle.site) {
    candidates.push(`${assetConfig.slidePuzzle.site}/${cleanPath}`);
  }

  // Upstream GitHub fallback
  if (assetConfig.slidePuzzle.fallbackSite) {
    candidates.push(`${assetConfig.slidePuzzle.fallbackSite}/${cleanPath}`);
  }

  return [...new Set(candidates)];
}

async function fetchFromCandidates(path: string): Promise<string> {
  const urls = getCandidateUrls(path);
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.text();
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Failed to load ${path} from all sources: ${urls.join(", ")}`, {
    cause: lastError,
  });
}

export function fetchPuzzleIndex(): Promise<SlidePuzzleIndexItem[]> {
  if (indexCache) return indexCache;

  indexCache = fetchFromCandidates("index.jsonl")
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
  const promise = fetchFromCandidates(fileName)
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
      throw err;
    });

  solutionCache.set(cacheKey, promise);
  return promise;
}

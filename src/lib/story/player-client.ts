import { assetConfig } from "@/config/assets";
import { loadCubismCore } from "@/lib/live2d/client";
import { getStoriesIndexUrl, getStoryManifestUrl, type StorySiteEntry } from "@/lib/story/player-data";

/** Network side of the story player: the published story index, one story's presence and the page-side scripts. */

/** `stories.json` of the published site; no stories when the site has none yet (404). */
export async function fetchStorySite(signal: AbortSignal): Promise<StorySiteEntry[]> {
  const response = await fetch(getStoriesIndexUrl(), { signal, credentials: "omit", headers: { Accept: "application/json" } });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`stories.json: HTTP ${response.status}`);
  const index = (await response.json()) as { stories?: unknown };
  return Array.isArray(index.stories)
    ? index.stories.filter((entry): entry is StorySiteEntry => typeof entry === "object" && entry !== null
      && typeof (entry as StorySiteEntry).advId === "number" && typeof (entry as StorySiteEntry).manifest === "string")
    : [];
}

/**
 * One story's entry read from its manifest (whose `story` block is the index entry), for a story the index does not
 * list yet: a build publishes each manifest as it lands and rewrites stories.json at its end. null when there is none.
 */
export async function fetchSiteStory(advId: number, signal: AbortSignal): Promise<StorySiteEntry | null> {
  const manifest = `stories/${advId}.json`;
  const response = await fetch(getStoryManifestUrl(manifest), { signal, credentials: "omit", headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const body = (await response.json()) as { audio?: boolean; story?: Partial<StorySiteEntry> };
  const story = body.story;
  if (!story || story.advId !== advId || !Array.isArray(story.languages)) return null;
  return {
    id: String(advId), advId, manifest, titles: story.titles ?? {}, languages: story.languages, language: story.language ?? story.languages[0] ?? "ja",
    playbackMode: story.playbackMode ?? 0, audio: body.audio ?? true,
  };
}

/** Whether the story site has the episode (a HEAD of its manifest, so a story page need not read the whole index). */
export async function hasSiteStory(advId: number, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(getStoryManifestUrl(`stories/${advId}.json`), { method: "HEAD", signal, credentials: "omit" });
    return response.ok;
  } catch {
    return false;
  }
}

/** What the page could load besides Cubism Core: missing optional scripts only take their part out of the story. */
export interface StoryRuntimes {
  motionSync: boolean;
  spine: boolean;
}

let optional: Promise<StoryRuntimes> | null = null;

/**
 * Live2D Cubism Core (required: without it a story does not load), then the optional MotionSync Core and Spine runtime
 * when the deployment names them (`assetConfig`). All are classic scripts defining globals, each its maker's software.
 */
export async function loadStoryRuntimes(): Promise<StoryRuntimes> {
  await loadCubismCore(assetConfig.cubismCore);
  optional ??= Promise.all([
    loadGlobalScript("Live2DCubismMotionSyncCore", assetConfig.motionSyncCore),
    loadGlobalScript("spine", assetConfig.spineRuntime),
  ]).then(([motionSync, spine]) => ({ motionSync, spine }));
  return optional;
}

/** Loads `url` once as a classic script; resolves to whether it defined `global` (false without a url or on failure). */
function loadGlobalScript(global: string, url: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (global in window) {
      resolve(true);
      return;
    }
    if (!url) {
      resolve(false);
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.addEventListener("load", () => resolve(global in window));
    script.addEventListener("error", () => {
      script.remove();
      console.warn(`[story-player] ${global} could not be loaded from ${url}`);
      resolve(false);
    });
    document.head.append(script);
  });
}

import { DEFAULT_LOCALE } from "@/config/locales";
import { buildFetch } from "@/lib/build/fetch";
import { getBuildStories } from "@/lib/masterdata/build-data";
import { isStoryReleasedForServer } from "@/lib/story/release";
import { STORY_LANGUAGES, getStorySites, type StorySiteEntry, type StorySiteRegion } from "@/lib/story/player-data";

interface ReleasedStoryIndexEntry extends Omit<StorySiteEntry, "root" | "server"> {
  /** The path from the untrusted upstream index; never sent to the browser. */
  sourceManifest: string;
}

interface StorySite {
  root: string;
  server: StorySiteRegion;
}

export interface ReleasedStorySiteIndex {
  site: StorySite;
  stories: ReleasedStoryIndexEntry[];
}

export interface GatedStoryBundle {
  /** Rewritten story manifest whose relative resources stay under the story-scoped proxy URL. */
  manifest: Record<string, unknown>;
  /** Paths under the upstream site root which this released story's manifests actually reference. */
  assetPaths: ReadonlySet<string>;
  /** Model manifests reachable from this story, keyed by their upstream site-relative path. */
  modelManifests: ReadonlyMap<string, Record<string, unknown>>;
}

const ASSET_PATH = /^assets\/[a-f0-9]{64}(?:\.[a-z0-9_-]+)+$/;
const MODEL_PATH = /^models\/[a-z0-9_]+\.json$/;
const storyBundleCache = new Map<string, { expiresAt: number; promise: Promise<GatedStoryBundle | null> }>();
const STORY_BUNDLE_TTL_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Only index paths that name the same episode and cannot leave the stories directory. */
export function getIndexedStoryManifestPath(value: unknown, advId: number): string | null {
  if (typeof value !== "string" || !Number.isSafeInteger(advId) || advId <= 0) return null;
  const segments = value.split("/");
  if (segments.length < 2 || segments.length > 3 || segments[0] !== "stories" || segments.at(-1) !== `${advId}.json`) return null;
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[a-zA-Z0-9_.-]+$/.test(segment))) return null;
  return value;
}

function supportsRegion(entry: Record<string, unknown>, server: StorySiteRegion): boolean {
  if (entry.regions === undefined) return true;
  return Array.isArray(entry.regions) && entry.regions.every((region) => typeof region === "string") && entry.regions.includes(server);
}

function sanitizeIndexEntry(entry: Record<string, unknown>, advId: number, sourceManifest: string): ReleasedStoryIndexEntry | null {
  const languages = Array.isArray(entry.languages)
    ? [...new Set(entry.languages.filter((language): language is typeof STORY_LANGUAGES[number] =>
      typeof language === "string" && (STORY_LANGUAGES as readonly string[]).includes(language)))]
    : [];
  if (languages.length === 0) return null;

  const titles: Partial<Record<typeof STORY_LANGUAGES[number], string>> = {};
  if (isRecord(entry.titles)) {
    for (const language of STORY_LANGUAGES) {
      const title = entry.titles[language];
      if (typeof title === "string" && title.trim()) titles[language] = title;
    }
  }
  const language = typeof entry.language === "string" && languages.includes(entry.language as typeof languages[number])
    ? entry.language
    : languages[0]!;

  let size: StorySiteEntry["size"];
  if (isRecord(entry.size) && typeof entry.size.common === "number" && Number.isFinite(entry.size.common) && entry.size.common >= 0) {
    const languageSizes: Partial<Record<string, number>> = {};
    if (isRecord(entry.size.languages)) {
      for (const [key, value] of Object.entries(entry.size.languages)) {
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) languageSizes[key] = value;
      }
    }
    size = { common: entry.size.common, languages: languageSizes };
  }

  return {
    id: String(advId),
    advId,
    manifest: `stories/${advId}.json`,
    sourceManifest,
    titles,
    languages,
    language,
    playbackMode: entry.playbackMode === 1 ? 1 : 0,
    audio: entry.audio !== false,
    ...(size ? { size } : {}),
  };
}

/** The server-side story index after intersecting it with official release data for that same region. */
export async function getReleasedStorySiteIndex(server: StorySiteRegion, now = Date.now()): Promise<ReleasedStorySiteIndex> {
  const site = getStorySites().find((candidate) => candidate.server === server);
  if (!site) return { site: { root: "", server }, stories: [] };

  const [response, masterStories] = await Promise.all([
    buildFetch(`${site.root}/stories.json`, { cache: "no-store", headers: { Accept: "application/json" }, redirect: "error" }),
    getBuildStories(DEFAULT_LOCALE),
  ]);
  if (response.status === 404) return { site, stories: [] };
  if (!response.ok) throw new Error(`Story site index returned HTTP ${response.status}`);

  const index: unknown = await response.json();
  if (!isRecord(index) || index.format !== "ournotes.stories/1" || !Array.isArray(index.stories)) {
    return { site, stories: [] };
  }

  const localByAdvId = new Map<number, (typeof masterStories)[number]>();
  for (const story of masterStories) {
    if (story.servers.includes(server) && isStoryReleasedForServer(story, server, now)) {
      localByAdvId.set(story.advId, story);
    }
  }

  const stories: ReleasedStoryIndexEntry[] = [];
  for (const rawEntry of index.stories) {
    if (!isRecord(rawEntry) || typeof rawEntry.advId !== "number" || !Number.isSafeInteger(rawEntry.advId) || rawEntry.advId <= 0) continue;
    const advId = rawEntry.advId as number;
    const story = localByAdvId.get(advId);
    const sourceManifest = getIndexedStoryManifestPath(rawEntry.manifest, advId);
    if (!story || !sourceManifest || !supportsRegion(rawEntry, server)) continue;
    const sanitized = sanitizeIndexEntry(rawEntry, advId, sourceManifest);
    if (sanitized) stories.push(sanitized);
  }
  return { site, stories };
}

function collectAssetPaths(files: unknown, output: Set<string>): boolean {
  if (!isRecord(files)) return false;
  for (const file of Object.values(files)) {
    if (!isRecord(file)) return false;
    if (typeof file.asset === "string") {
      if (!ASSET_PATH.test(file.asset)) return false;
      output.add(file.asset);
    }
    if (file.parts !== undefined) {
      if (!Array.isArray(file.parts)) return false;
      for (const part of file.parts) {
        if (!Array.isArray(part) || typeof part[1] !== "string" || !ASSET_PATH.test(part[1])) return false;
        output.add(part[1]);
      }
    }
    if (typeof file.asset !== "string" && file.parts === undefined) return false;
  }
  return true;
}

function addStoryAssets(manifest: Record<string, unknown>, output: Set<string>): boolean {
  if (!collectAssetPaths(manifest.files, output)) return false;
  if (manifest.languages !== undefined) {
    if (!isRecord(manifest.languages)) return false;
    for (const language of Object.values(manifest.languages)) {
      if (!isRecord(language) || !collectAssetPaths(language.files, output)) return false;
    }
  }
  return true;
}

async function fetchJson(siteRoot: string, path: string): Promise<Record<string, unknown> | null> {
  const url = new URL(path, `${siteRoot.replace(/\/+$/, "")}/`);
  const root = new URL(`${siteRoot.replace(/\/+$/, "")}/`);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null;
  const response = await buildFetch(url, { cache: "no-store", headers: { Accept: "application/json" }, redirect: "error" });
  if (!response.ok) return null;
  const value: unknown = await response.json().catch(() => null);
  return isRecord(value) ? value : null;
}

async function loadStoryBundle(server: StorySiteRegion, advId: number): Promise<GatedStoryBundle | null> {
  const { site, stories } = await getReleasedStorySiteIndex(server);
  if (!site.root) return null;
  const entry = stories.find((story) => story.advId === advId);
  if (!entry) return null;

  const manifest = await fetchJson(site.root, entry.sourceManifest);
  if (!manifest || manifest.format !== "ournotes.story-manifest/2" || manifest.advId !== advId) return null;
  if (!supportsRegion(manifest, server)) return null;

  const assetPaths = new Set<string>();
  if (!addStoryAssets(manifest, assetPaths)) return null;

  const modelManifests = new Map<string, Record<string, unknown>>();
  if (manifest.models !== undefined) {
    if (!isRecord(manifest.models)) return null;
    for (const modelPath of Object.values(manifest.models)) {
      if (typeof modelPath !== "string" || !MODEL_PATH.test(modelPath)) return null;
      const modelManifest = await fetchJson(site.root, modelPath);
      if (!modelManifest || !Number.isInteger(modelManifest.format) || !collectAssetPaths(modelManifest.files, assetPaths)) return null;
      modelManifests.set(modelPath, modelManifest);
    }
  }

  return {
    manifest: { ...manifest, root: `./${advId}/` },
    assetPaths,
    modelManifests,
  };
}

/**
 * The same-origin resource proxy checks MasterData release before consulting this short cache, so a cloud index or a
 * directly requested manifest can never authorize an unknown, missing-date or unreleased episode.
 */
export async function getGatedStoryBundle(server: StorySiteRegion, advId: number): Promise<GatedStoryBundle | null> {
  if (!Number.isSafeInteger(advId) || advId <= 0) return null;
  const stories = await getBuildStories(DEFAULT_LOCALE);
  const local = stories.find((story) => story.advId === advId);
  if (!local || !isStoryReleasedForServer(local, server, Date.now())) return null;

  const key = `${server}:${advId}`;
  const cached = storyBundleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = loadStoryBundle(server, advId).catch((error: unknown) => {
    storyBundleCache.delete(key);
    throw error;
  });
  storyBundleCache.set(key, { expiresAt: Date.now() + STORY_BUNDLE_TTL_MS, promise });
  return promise;
}

/** The allowed upstream root path for one already validated resource request. */
export function getApprovedStoryResourcePath(path: unknown): string | null {
  if (typeof path !== "string" || path.includes("\\") || path.includes("?") || path.includes("#")) return null;
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  if (ASSET_PATH.test(path) || MODEL_PATH.test(path)) return path;
  return null;
}

/** Public index metadata without the upstream manifest path used only by the proxy. */
export function toPublicStoryIndexEntry(entry: ReleasedStoryIndexEntry): Omit<ReleasedStoryIndexEntry, "sourceManifest"> {
  const { sourceManifest: _sourceManifest, ...publicEntry } = entry;
  return publicEntry;
}

/** Server names accepted by the story-site routes; the sites are only published for TW and JP. */
export function isStorySiteRegion(value: string): value is StorySiteRegion {
  return value === "tw" || value === "jp";
}

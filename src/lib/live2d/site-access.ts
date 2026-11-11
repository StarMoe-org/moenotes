import { assetConfig } from "@/config/assets";
import { getLive2DProxyApiRoot } from "@/config/routes";
import { isGameServer, type GameServer } from "@/config/servers";
import { buildFetch } from "@/lib/build/fetch";
import { costumeGroupId, isCostumeReleased, type RawCharacterCostume, type RawCharacterCostumeGroup } from "@/lib/characters/data";
import { table } from "@/lib/masterdata/build-core";
import { getStorySites } from "@/lib/story/player-data";
import { getLive2DModelManifestUrl, type Live2DModel, type Live2DModelEntry, parseLive2DModel } from "@/lib/live2d/models";

export type Live2DSource = "chart" | "story";

export interface ReleasedLive2DEntry {
  server: GameServer;
  source: Live2DSource;
  root: string;
  entry: Live2DModelEntry;
}

export interface GatedLive2DBundle {
  root: string;
  manifest: Record<string, unknown>;
  assetPaths: ReadonlySet<string>;
}

const MODEL_ID = /^[a-z0-9_]+$/;
const ASSET_PATH = /^assets\/[a-f0-9]{64}(?:\.[a-z0-9_-]+)+$/;
const indexCache = new Map<string, { expiresAt: number; promise: Promise<Live2DModelEntry[]> }>();
const bundleCache = new Map<string, { expiresAt: number; promise: Promise<GatedLive2DBundle | null> }>();
const INDEX_TTL_MS = 15_000;
const BUNDLE_TTL_MS = 30_000;

/** Clear short-lived cloud lookups between proxy-handler tests. */
export function resetLive2DSiteAccessCachesForTests(): void {
  indexCache.clear();
  bundleCache.clear();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** MasterCharacterCostume.live2dPath names one exact model, under a group directory. */
export function live2DModelIdFromCostumePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.split("/").filter(Boolean);
  const id = parts.at(-1) ?? "";
  return MODEL_ID.test(id) ? id : null;
}

/** The exact model ids the selected server's released costume groups authorize. */
export function releasedLive2DModelIds(
  costumes: readonly RawCharacterCostume[],
  groups: readonly RawCharacterCostumeGroup[],
  now: number,
): Set<string> {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const ids = new Set<string>();
  for (const costume of costumes) {
    const group = groupsById.get(costumeGroupId(costume));
    if (!group || !isCostumeReleased({ startAt: group.startAt ?? "", isInitial: group.isInitial === true }, now)) continue;
    const id = live2DModelIdFromCostumePath(costume.live2dPath);
    if (id) ids.add(id);
  }
  return ids;
}

function sourceRoot(server: GameServer, source: Live2DSource): string | null {
  if (source === "chart") return assetConfig.chartSite;
  return getStorySites().find((site) => site.server === server)?.root ?? null;
}

function proxyRoot(server: GameServer, source: Live2DSource): string {
  return getLive2DProxyApiRoot(server, source);
}

async function fetchIndex(root: string): Promise<Live2DModelEntry[]> {
  const url = `${root.replace(/\/+$/, "")}/models.json`;
  const response = await buildFetch(url, {
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "application/json" },
    redirect: "error",
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Live2D model index returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (!isRecord(value) || !Array.isArray(value.models)) return [];
  const entries: Live2DModelEntry[] = [];
  for (const candidate of value.models) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !MODEL_ID.test(candidate.id)) continue;
    // Never trust a cloud path; the proxy derives the manifest name from this validated id.
    if (candidate.manifest !== undefined && candidate.manifest !== `models/${candidate.id}.json`) continue;
    const group = typeof candidate.group === "string" && /^[a-zA-Z0-9_-]+$/.test(candidate.group) ? candidate.group : undefined;
    const character = typeof candidate.character === "number" && Number.isSafeInteger(candidate.character) && candidate.character > 0
      ? candidate.character
      : undefined;
    const bytes = typeof candidate.bytes === "number" && Number.isFinite(candidate.bytes) && candidate.bytes >= 0
      ? candidate.bytes
      : undefined;
    entries.push({
      id: candidate.id,
      manifest: `models/${candidate.id}.json`,
      ...(group ? { group } : {}),
      ...(character ? { character } : {}),
      ...(bytes !== undefined ? { bytes } : {}),
    });
  }
  return entries;
}

async function cachedIndex(server: GameServer, source: Live2DSource, root: string): Promise<Live2DModelEntry[]> {
  const key = `${server}:${source}`;
  const cached = indexCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = fetchIndex(root).catch((error: unknown) => {
    indexCache.delete(key);
    throw error;
  });
  indexCache.set(key, { expiresAt: Date.now() + INDEX_TTL_MS, promise });
  return promise;
}

/** A sanitized regional index intersected with exact costume identities from released MasterData. */
export async function getReleasedLive2DEntries(server: GameServer, now = Date.now()): Promise<ReleasedLive2DEntry[]> {
  const [costumes, groups] = await Promise.all([
    table<RawCharacterCostume>("MasterCharacterCostume.json", server),
    table<RawCharacterCostumeGroup>("MasterCharacterCostumeGroup.json", server),
  ]);
  const allowed = releasedLive2DModelIds(costumes._allData, groups._allData, now);
  if (!Number.isFinite(now) || allowed.size === 0) return [];

  const sources: Live2DSource[] = ["chart", "story"];
  const indexes = await Promise.all(sources.map(async (source) => {
    const root = sourceRoot(server, source);
    if (!root) return [] as ReleasedLive2DEntry[];
    const entries = await cachedIndex(server, source, root);
    return entries
      .filter((entry) => allowed.has(entry.id))
      .map((entry): ReleasedLive2DEntry => ({ server, source, root, entry }));
  }));

  // When both sites contain the same officially released model, prefer the story site's smaller files, as before.
  const byId = new Map<string, ReleasedLive2DEntry>();
  for (const entry of indexes.flat()) if (entry.source === "chart" || !byId.has(entry.entry.id)) byId.set(entry.entry.id, entry);
  for (const entry of indexes.flat()) if (entry.source === "story") byId.set(entry.entry.id, entry);
  return [...byId.values()].map((entry) => ({
    ...entry,
    entry: { ...entry.entry, manifest: `models/${entry.entry.id}.json` },
  }));
}

/** Publicly serializable Live2D models; the browser receives only same-origin, per-region manifest URLs. */
export async function getReleasedLive2DModels(server: GameServer, now = Date.now()): Promise<Live2DModel[]> {
  const entries = await getReleasedLive2DEntries(server, now);
  return entries.map(({ source, entry }) => parseLive2DModel(entry, proxyRoot(server, source)));
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

async function fetchModelBundle(entry: ReleasedLive2DEntry): Promise<GatedLive2DBundle | null> {
  const url = getLive2DModelManifestUrl(entry.entry.id, entry.root);
  const response = await buildFetch(url, {
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "application/json" },
    redirect: "error",
  });
  if (!response.ok) return null;
  const value: unknown = await response.json().catch(() => null);
  if (!isRecord(value) || ![2, 3].includes(Number(value.format)) || value.id !== entry.entry.id) return null;
  const assetPaths = new Set<string>();
  if (!collectAssetPaths(value.files, assetPaths)) return null;
  return { root: entry.root, manifest: value, assetPaths };
}

/** The model bundle gate rechecks regional MasterData on every manifest and asset request. */
export async function getGatedLive2DBundle(
  serverValue: string,
  sourceValue: string,
  modelId: string,
  now = Date.now(),
): Promise<GatedLive2DBundle | null> {
  if (!isGameServer(serverValue) || (sourceValue !== "chart" && sourceValue !== "story") || !MODEL_ID.test(modelId)) return null;
  const server = serverValue;
  const source = sourceValue as Live2DSource;
  const entry = (await getReleasedLive2DEntries(server, now)).find((candidate) => candidate.source === source && candidate.entry.id === modelId);
  if (!entry) return null;

  const key = `${server}:${source}:${modelId}`;
  const cached = bundleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = fetchModelBundle(entry).catch((error: unknown) => {
    bundleCache.delete(key);
    throw error;
  });
  bundleCache.set(key, { expiresAt: Date.now() + BUNDLE_TTL_MS, promise });
  return promise;
}

/** A path under the model root that a validated model manifest may name. */
export function getApprovedLive2DResourcePath(path: unknown): string | null {
  if (typeof path !== "string" || path.includes("\\") || path.includes("?") || path.includes("#")) return null;
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return ASSET_PATH.test(path) ? path : null;
}

/** Each listed model may only use the source that published its approved index entry. */
export function isLive2DSource(value: string): value is Live2DSource {
  return value === "chart" || value === "story";
}

/** Explicit proxy URL builder, used in tests and route handlers. */
export function live2DModelProxyManifest(server: GameServer, source: Live2DSource, modelId: string): string {
  return `${proxyRoot(server, source)}/models/${encodeURIComponent(modelId)}.json`;
}

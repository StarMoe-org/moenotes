import { GAME_SERVER_PROFILES, PRIMARY_SERVER, type GameServer } from "@/config/servers";
import { serverAssetUrl } from "@/lib/assets/release";
import { buildFetch } from "@/lib/build/fetch";
import { convertRawScoreBytesToDeckChart, type OverlayDeckChart } from "@/lib/deck/chart-convert";
import {
  getBuildManifest,
  getBuildMasterData,
  getBuildMasterVersion,
  isMasterDataManifestFresh,
  type MasterDataReadOptions,
} from "@/lib/masterdata/build-snapshot";
import { getChartFileUrl } from "@/lib/music/chart";

export const DECK_CHART_OVERLAY_FORMAT = "moenotes.deck-chart-overlay/1";
export const MAX_DECK_CHART_IDS = 500;
const CHART_FETCH_CONCURRENCY = 6;
const MAX_CACHED_CHARTS = 1200;
const NEGATIVE_CACHE_TTL_MS = 15_000;

export interface DeckChartOverlayPayload {
  format: typeof DECK_CHART_OVERLAY_FORMAT;
  server: GameServer;
  region: string;
  dataVersion: string;
  regionVersion: string | null;
  charts: OverlayDeckChart[];
  musicLengthsMs: Record<string, number>;
}

export interface DeckChartOverlayOptions extends MasterDataReadOptions {
  /** Bypass negative (404/unexported) cache entries when the user explicitly clicks Retry. */
  retry?: boolean;
}

type CachedChartEntry =
  | { status: "ready"; chart: OverlayDeckChart }
  | { status: "missing"; expiresAt: number };

interface ChartCacheState {
  entries: Map<string, CachedChartEntry>;
  inFlight: Map<string, Promise<OverlayDeckChart | null>>;
}

const chartCacheKey = Symbol.for("moenotes.masterdata.deck-chart-overlay.v1");
const globalChartCache = globalThis as typeof globalThis & { [chartCacheKey]?: ChartCacheState };
const cacheState = (globalChartCache[chartCacheKey] ??= {
  entries: new Map(),
  inFlight: new Map(),
});

export function resetDeckChartOverlayCacheForTests(): void {
  cacheState.entries.clear();
  cacheState.inFlight.clear();
}

export function parseScoreIdList(raw: string | null | undefined, maxCount: number = MAX_DECK_CHART_IDS): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!/^[1-9]\d{0,9}$/.test(trimmed)) continue;
    const id = Number(trimmed);
    if (Number.isSafeInteger(id) && id > 0) {
      seen.add(id);
      if (seen.size >= maxCount) break;
    }
  }
  return [...seen].sort((a, b) => a - b);
}

function parseMasterScoreMap(raw: unknown): Map<number, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid MasterLiveMusicScore container");
  }
  const allData = (raw as { _allData?: unknown })._allData;
  if (!Array.isArray(allData)) {
    throw new Error("MasterLiveMusicScore is missing _allData array");
  }
  const map = new Map<number, string>();
  for (const row of allData) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    const id = record._id;
    const fileName = typeof record._musicScoreTextFileName === "string" ? record._musicScoreTextFileName.trim() : "";
    if (
      typeof id === "number" &&
      Number.isSafeInteger(id) &&
      id > 0 &&
      fileName.length > 0 &&
      !/\.\.|[\x00-\x1f\\]/.test(fileName)
    ) {
      map.set(id, fileName);
    }
  }
  return map;
}

function rememberEntry(key: string, entry: CachedChartEntry): void {
  if (cacheState.entries.has(key)) cacheState.entries.delete(key);
  cacheState.entries.set(key, entry);
  while (cacheState.entries.size > MAX_CACHED_CHARTS) {
    const oldest = cacheState.entries.keys().next().value;
    if (oldest === undefined) break;
    cacheState.entries.delete(oldest);
  }
}

async function fetchChartBytesFromUrl(url: string, forceBypass: boolean): Promise<Uint8Array | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Response;
    try {
      response = await buildFetch(url, forceBypass ? { forceBypass: true } : undefined);
    } catch {
      if (attempt >= 2) return null;
      continue;
    }
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    }
    if (response.status !== 429 && response.status < 500) {
      return null;
    }
  }
  return null;
}

async function resolveOneChart(
  server: GameServer,
  scoreId: number,
  chartKey: string,
  options?: DeckChartOverlayOptions,
): Promise<OverlayDeckChart | null> {
  const forceBypass = Boolean(options?.forceBypass);
  const bypassNegative = forceBypass || Boolean(options?.retry);
  const assetRegion = GAME_SERVER_PROFILES[server].assetRegion;
  const key = `${assetRegion}|${scoreId}|${chartKey}`;

  if (!forceBypass) {
    const cached = cacheState.entries.get(key);
    if (cached) {
      if (cached.status === "ready") {
        // Refresh LRU position on hit.
        rememberEntry(key, cached);
        return cached.chart;
      }
      if (!bypassNegative && cached.expiresAt > Date.now()) {
        return null;
      }
      cacheState.entries.delete(key);
    }
    const existingFlight = cacheState.inFlight.get(key);
    if (existingFlight) return existingFlight;
  }

  const task = (async (): Promise<OverlayDeckChart | null> => {
    const baseUrl = getChartFileUrl(chartKey);
    const primaryUrl = serverAssetUrl(baseUrl, server);
    let bytes = await fetchChartBytesFromUrl(primaryUrl, forceBypass);
    if (!bytes && server !== PRIMARY_SERVER && server !== "jp") {
      const fallbackUrl = serverAssetUrl(baseUrl, PRIMARY_SERVER);
      if (fallbackUrl !== primaryUrl) {
        bytes = await fetchChartBytesFromUrl(fallbackUrl, forceBypass);
      }
    }
    if (!bytes) {
      rememberEntry(key, { status: "missing", expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS });
      return null;
    }
    try {
      const converted = await convertRawScoreBytesToDeckChart(scoreId, bytes);
      rememberEntry(key, { status: "ready", chart: converted });
      return converted;
    } catch {
      rememberEntry(key, { status: "missing", expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS });
      return null;
    }
  })().finally(() => {
    if (cacheState.inFlight.get(key) === task) {
      cacheState.inFlight.delete(key);
    }
  });

  if (!forceBypass) {
    cacheState.inFlight.set(key, task);
  }
  return task;
}

export async function getDeckChartOverlay(
  server: GameServer = PRIMARY_SERVER,
  scoreIds: readonly number[],
  options?: DeckChartOverlayOptions,
): Promise<DeckChartOverlayPayload> {
  const forceBypass = Boolean(options?.forceBypass);
  if (!forceBypass && !isMasterDataManifestFresh()) {
    await getBuildManifest();
  }
  const manifest = await getBuildManifest(options);
  const regionVersion = (await getBuildMasterVersion(server, options)) ?? null;
  const region = GAME_SERVER_PROFILES[server].masterdataRegion;

  const uniqueIds = [...new Set(scoreIds.filter((id) => Number.isSafeInteger(id) && id > 0))]
    .sort((a, b) => a - b)
    .slice(0, MAX_DECK_CHART_IDS);

  if (uniqueIds.length === 0) {
    return {
      format: DECK_CHART_OVERLAY_FORMAT,
      server,
      region,
      dataVersion: manifest.dataVersion || "unknown",
      regionVersion,
      charts: [],
      musicLengthsMs: {},
    };
  }

  const readOptions: MasterDataReadOptions | undefined = forceBypass ? { forceBypass: true } : undefined;
  const scoreMap = await getBuildMasterData("MasterLiveMusicScore.json", parseMasterScoreMap, server, readOptions);
  const targets = uniqueIds
    .map((id) => ({ id, chartKey: scoreMap.get(id) }))
    .filter((entry): entry is { id: number; chartKey: string } => typeof entry.chartKey === "string" && entry.chartKey.length > 0);

  const charts: OverlayDeckChart[] = [];
  const musicLengthsMs: Record<string, number> = {};

  for (let i = 0; i < targets.length; i += CHART_FETCH_CONCURRENCY) {
    const batch = targets.slice(i, i + CHART_FETCH_CONCURRENCY);
    const resolved = await Promise.all(
      batch.map((item) => resolveOneChart(server, item.id, item.chartKey, options)),
    );
    for (const chart of resolved) {
      if (!chart) continue;
      charts.push(chart);
      musicLengthsMs[String(chart.scoreId)] = chart.durationMs;
    }
  }

  return {
    format: DECK_CHART_OVERLAY_FORMAT,
    server,
    region,
    dataVersion: manifest.dataVersion || "unknown",
    regionVersion,
    charts,
    musicLengthsMs,
  };
}

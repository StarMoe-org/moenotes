import { buildEnv } from "@/config/build-env";
import { cacheConfig } from "@/config/cache";
import { PRIMARY_SERVER, GAME_SERVER_PROFILES, type GameServer } from "@/config/servers";
import type { AppLocale } from "@/config/locales";
import {
  currentMasterDataEpochSync,
  currentMasterDataPurgeGenerationSync,
  getBuildManifest,
  getBuildMasterData,
  getBuildTableKey,
  isMasterDataManifestFresh,
  maxCachedTables,
  toSharedTableKey,
} from "@/lib/masterdata/build-snapshot";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import { mergeServerLists, mergeServerValues, type ServerFaceted, type ServerFacetedValue } from "@/lib/servers/facets";
import { validateMasterTable, type MasterTable, type RawText } from "@/lib/cards/data";
import { MASTER_TEXT_FIELDS, isUsableMasterText, type LocalizableMasterText } from "@/lib/masterdata/localize-text";
import { MASTER_UTC_OFFSET, isUntaggedMasterDate } from "@/lib/schedule";

/*
 * Domain-free plumbing of the catalog: the shared table cache, version-aware selector memoization, the per-server
 * merge helpers, the cross-filled MasterText, and the helpers the content search index builds titles and search texts
 * with. When the runtime MasterData manifest rotates to a new dataVersion, derived selectors clear automatically while
 * unchanged SHA-256 content-addressed tables stay warm.
 */

interface BuildDataState {
  epoch: number;
  purgeGeneration: number;
  tables: Map<string, Promise<MasterTable<unknown>>>;
  selectors: Map<string, Promise<unknown>>;
  coreSelectors: Map<string, Promise<unknown>>;
}

const buildDataKey = Symbol.for("moenotes.masterdata.build-data.v3");
const globalState = globalThis as typeof globalThis & { [buildDataKey]?: BuildDataState };
const coreSelectors = new Map<string, Promise<unknown>>();
const selectors = new (class extends Map<string, Promise<unknown>> {
  override clear(): void {
    super.clear();
    coreSelectors.clear();
  }
})();
export const state = globalState[buildDataKey] ??= {
  epoch: -1,
  purgeGeneration: -1,
  tables: new Map(),
  selectors,
  coreSelectors,
};
state.coreSelectors ??= coreSelectors;

const CORE_SELECTOR_EXACT = new Set([
  "character-voices",
  "band-item-upgrades",
  "search-text-rows",
  "deck-arenas",
  "story-reader-lookup",
  "progression-references",
  "content-search-index",
  "theme-bands-by-locale",
]);

const CORE_SELECTOR_PREFIXES = [
  "texts:",
  "sound-paths:",
  "voice-lines:",
  "progression-reference:",
  "cards:",
  "support-cards:",
  "characters:",
  "character-progression:",
  "character-missions:",
  "music:",
  "music-categories:",
  "items:",
  "item-sources:",
  "item-usages:",
  "item-details:",
  "item-summaries:",
  "item-neighbors:",
  "band-items:",
  "band-names:",
  "gacha-details:",
  "gachas:",
  "home:",
  "degrees:",
  "backgrounds:",
  "reward-resolver:",
  "reward-entries:",
  "reward-summaries:",
  "event-details:",
  "events:",
  "deck-events:",
  "deck-cards:",
  "stamps:",
  "exchanges:",
  "exchange-details:",
  "comics:",
  "stories:",
  "story-script-lookups:",
  "calendar:",
  "calendar-birthdays:",
  "arena-catalog:",
  "arena-catalogs:",
  "catalog-counts:",
  "catalog-covers:",
  "card-skill-names:",
  "item-cost-resolver:",
  "guess-songs:",
  "help:",
  "help-categories:",
  "help-tips:",
  "help-faq:",
  "help-topics:",
  "regular-missions:",
  "limited-mission-groups:",
  "real-lives:",
  "theme-bands:",
  "shops:",
  "shop-neighbors:",
  "skill-dictionary:",
  "skill-dictionaries:",
  "sound-urls:",
  "tgw-card:",
] as const;

function isCoreSelectorKey(key: string): boolean {
  return CORE_SELECTOR_EXACT.has(key) || CORE_SELECTOR_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function syncEpoch(): void {
  const epoch = currentMasterDataEpochSync();
  const purgeGeneration = currentMasterDataPurgeGenerationSync();
  const purged = state.purgeGeneration !== purgeGeneration;
  if (state.epoch === epoch && !purged) return;
  state.epoch = epoch;
  state.purgeGeneration = purgeGeneration;
  state.selectors.clear();
  state.coreSelectors.clear();
  if (purged) {
    state.tables.clear();
    return;
  }
  for (const key of state.tables.keys()) {
    if (!key.startsWith("sha256:")) {
      state.tables.delete(key);
    }
  }
}

async function ensureEpochFresh(): Promise<void> {
  if (!isMasterDataManifestFresh()) {
    await getBuildManifest();
  }
  syncEpoch();
}

/**
 * A server's table, shared with every server serving the same bytes in the same time zone. Timestamps of a server
 * whose MasterData is not timed in UTC+8 get its offset appended, so parseMasterDate reads them right everywhere.
 */
export async function table<T>(path: string, server: GameServer): Promise<MasterTable<T>> {
  await ensureEpochFresh();
  const offset = GAME_SERVER_PROFILES[server].masterdataUtcOffset;
  const tagged = offset !== MASTER_UTC_OFFSET && path !== "MasterText.json";
  if (!tagged) {
    return getBuildMasterData(path, validateMasterTable<unknown>, server) as Promise<MasterTable<T>>;
  }
  const key = `${toSharedTableKey(await getBuildTableKey(server, path))}@${offset}`;
  syncEpoch();
  let request = state.tables.get(key);
  if (request) {
    state.tables.delete(key);
    state.tables.set(key, request);
  } else {
    const loading = getBuildMasterData(path, validateMasterTable<unknown>, server)
      .then((loaded) => tagMasterDates(loaded, offset))
      .catch((error) => {
        if (state.tables.get(key) === loading) state.tables.delete(key);
        throw error;
      });
    request = loading;
    state.tables.set(key, request);
    const limit = maxCachedTables();
    while (state.tables.size > limit) {
      const oldest = state.tables.keys().next().value;
      if (oldest === undefined) break;
      state.tables.delete(oldest);
    }
  }
  return request as Promise<MasterTable<T>>;
}

export function tagMasterDates(loaded: MasterTable<unknown>, offset: string): MasterTable<unknown> {
  return {
    _allData: loaded._allData.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      return Object.fromEntries(Object.entries(row).map(([field, value]) => [field, typeof value === "string" && isUntaggedMasterDate(value) ? `${value.trim()}${offset}` : value]));
    }),
  };
}

function maxCachedSelectors(): number {
  const raw = buildEnv("MOENOTES_MASTERDATA_MAX_SELECTORS");
  if (!raw) return cacheConfig.masterdata.maxSelectors;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : cacheConfig.masterdata.maxSelectors;
}

function selectorStoreFor(key: string): Map<string, Promise<unknown>> {
  return isCoreSelectorKey(key) ? state.coreSelectors : state.selectors;
}

function renewedSelector(key: string): Promise<unknown> | undefined {
  const store = selectorStoreFor(key);
  const request = store.get(key);
  if (request && store === state.selectors) {
    store.delete(key);
    store.set(key, request);
  }
  return request;
}

/**
 * A derived selector, loaded once per epoch while it stays among the most recently used. Core global selectors
 * live in an un-evicted epoch partition so detail-page selector churn cannot evict them. An in-flight selector can
 * be evicted too: its callers keep the promise and a later caller loads it anew, so a failure only drops its own entry.
 */
export function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (isMasterDataManifestFresh()) {
    syncEpoch();
    const cached = renewedSelector(key);
    if (cached) return cached as Promise<T>;
  }
  return (async () => {
    await ensureEpochFresh();
    const store = selectorStoreFor(key);
    let request = renewedSelector(key);
    if (!request) {
      const loading: Promise<unknown> = load().catch((error) => {
        if (store.get(key) === loading) store.delete(key);
        throw error;
      });
      request = loading;
      store.set(key, request);
      if (store === state.selectors) {
        const limit = maxCachedSelectors();
        while (store.size > limit) {
          const oldest = store.keys().next().value;
          if (oldest === undefined) break;
          store.delete(oldest);
        }
      }
    }
    return request as Promise<T>;
  })();
}

export async function eachServer<T>(load: (server: GameServer) => Promise<T>): Promise<Array<readonly [GameServer, T]>> {
  const servers = await getBuildServers();
  return Promise.all(servers.map(async (server) => [server, await load(server)] as const));
}

export function mergedList<T>(key: string, load: (server: GameServer) => Promise<T[]>, idOf: (item: T) => string | number): Promise<ServerFaceted<T>[]> {
  return memo(key, async () => mergeServerLists(await eachServer(load), idOf));
}

export function mergedValue<T>(key: string, load: (server: GameServer) => Promise<T | null>): Promise<ServerFacetedValue<T> | null> {
  return memo(key, async () => mergeServerValues(await eachServer(load)));
}

/**
 * A server's MasterText, with each cell it leaves without copy taken from the other servers' row of the same id (the
 * JP tables carry Japanese only, the international ones miss some Japanese), and CRLF line ends as LF. The servers'
 * views of the entities they share therefore agree, and JP-only entities read in Japanese.
 */
export function texts(server: GameServer): Promise<MasterTable<RawText>> {
  return memo(`texts:${server}`, async () => {
    const servers = await getBuildServers();
    const [own, ...donors] = await Promise.all([server, ...servers.filter((other) => other !== server)].map((source) => table<RawText>("MasterText.json", source)));
    const donorRows = donors.map((donor) => new Map(donor._allData.map((row) => [row.id, row])));
    return {
      _allData: own!._allData.map((row) => {
        const filled = { ...row };
        for (const field of MASTER_TEXT_FIELDS) {
          let value = filled[field];
          if (!isUsableMasterText(value, row.id)) {
            for (const rows of donorRows) {
              const candidate = rows.get(row.id)?.[field];
              if (isUsableMasterText(candidate, row.id)) {
                value = candidate;
                break;
              }
            }
          }
          if (typeof value === "string") filled[field] = value.replace(/\r\n?/g, "\n");
        }
        return filled;
      }),
    };
  });
}

/** The core UI locales a per-locale searchText is built for; other locales read the English one. */
const SEARCH_TEXT_LOCALES: readonly AppLocale[] = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"];

/** MasterText rows by id on the primary server, for resolving entity titles to their five language cells. */
export async function primaryTextRows(): Promise<Map<string, RawText>> {
  return memo("search-text-rows", async () => new Map((await texts(PRIMARY_SERVER))._allData.map((row) => [row.id, row])));
}

export function titleRow(rows: Map<string, RawText>, textId: string | undefined): LocalizableMasterText {
  if (!textId) return {};
  const row = rows.get(textId);
  if (!row) return {};
  return {
    id: row.id,
    japanese: row.japanese,
    english: row.english,
    simplifiedChinese: row.simplifiedChinese,
    traditionalChinese: row.traditionalChinese,
    korean: row.korean,
  };
}

/**
 * Per-locale searchText of every entity of one kind: each locale's list is loaded once and indexed by `idOf`, so
 * building the index is linear rather than re-scanning the list per entity. Values equal to the English one are left
 * out — the client falls back to English for both UI-only locales and entities whose search text does not vary.
 */
export async function perLocaleSearchTexts<VM extends { searchText: string }>(
  load: (locale: AppLocale) => Promise<Array<ServerFaceted<VM>>>,
  idOf: (item: ServerFaceted<VM>) => string | number,
): Promise<Map<string, Map<AppLocale, string>>> {
  const byLocale = new Map<AppLocale, Map<string, string>>();
  await Promise.all(SEARCH_TEXT_LOCALES.map(async (locale) => {
    const map = new Map<string, string>();
    for (const item of await load(locale)) if (item.searchText) map.set(String(idOf(item)), item.searchText);
    byLocale.set(locale, map);
  }));
  const english = byLocale.get("en-US") ?? new Map<string, string>();
  const out = new Map<string, Map<AppLocale, string>>();
  for (const id of new Set([...byLocale.values()].flatMap((map) => [...map.keys()]))) {
    const variants = new Map<AppLocale, string>();
    for (const locale of SEARCH_TEXT_LOCALES) {
      const value = byLocale.get(locale)?.get(id);
      if (value !== undefined && (locale === "en-US" || value !== english.get(id))) variants.set(locale, value);
    }
    out.set(id, variants);
  }
  return out;
}

/** Serialize an entity's per-locale searchText map to the index's JSON shape. */
export function toSearchTextRecord(map: Map<AppLocale, string> | undefined): Partial<Record<AppLocale, string>> {
  return map ? Object.fromEntries(map) : {};
}

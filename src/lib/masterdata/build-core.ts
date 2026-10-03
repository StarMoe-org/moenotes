import { PRIMARY_SERVER, GAME_SERVER_PROFILES, type GameServer } from "@/config/servers";
import type { AppLocale } from "@/config/locales";
import { getBuildMasterData, getBuildTableKey } from "@/lib/masterdata/build-snapshot";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import { mergeServerLists, mergeServerValues, type ServerFaceted, type ServerFacetedValue } from "@/lib/servers/facets";
import { validateMasterTable, type MasterTable, type RawText } from "@/lib/cards/data";
import { MASTER_TEXT_FIELDS, isUsableMasterText, type LocalizableMasterText } from "@/lib/masterdata/localize-text";
import { MASTER_UTC_OFFSET, isUntaggedMasterDate } from "@/lib/schedule";

/*
 * Domain-free plumbing of the build-time catalog (moved verbatim out of build-data.ts so domain selectors can live in
 * their own build-<domain>.ts files): the shared table cache, selector memoization, the per-server merge helpers, the
 * cross-filled MasterText, and the helpers the content search index builds titles and search texts with.
 */

interface BuildDataState {
  tables: Map<string, Promise<MasterTable<unknown>>>;
  selectors: Map<string, Promise<unknown>>;
}

// Versioned: a dev server keeps this state across reloads, and the merged selectors reuse the earlier keys.
const buildDataKey = Symbol.for("moenotes.masterdata.build-data.v2");
const globalState = globalThis as typeof globalThis & { [buildDataKey]?: BuildDataState };
export const state = globalState[buildDataKey] ??= { tables: new Map(), selectors: new Map() };

/**
 * A server's table, shared with every server serving the same bytes in the same time zone. Timestamps of a server
 * whose MasterData is not timed in UTC+8 get its offset appended, so parseMasterDate reads them right everywhere.
 */
export async function table<T>(path: string, server: GameServer): Promise<MasterTable<T>> {
  const offset = GAME_SERVER_PROFILES[server].masterdataUtcOffset;
  const tagged = offset !== MASTER_UTC_OFFSET && path !== "MasterText.json";
  const key = `${await getBuildTableKey(server, path)}${tagged ? `@${offset}` : ""}`;
  let request = state.tables.get(key);
  if (!request) {
    request = getBuildMasterData(path, validateMasterTable<unknown>, server).then((loaded) => tagged ? tagMasterDates(loaded, offset) : loaded);
    state.tables.set(key, request);
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

export function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  let request = state.selectors.get(key);
  if (!request) {
    request = load();
    state.selectors.set(key, request);
  }
  return request as Promise<T>;
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

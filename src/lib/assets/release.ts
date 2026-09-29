import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { ASSET_LANGUAGES as SERVER_ASSET_LANGUAGES, GAME_SERVER_PROFILES, GAME_SERVERS, type AssetLanguage, type GameServer } from "@/config/servers";
import { masterTextFieldOrder, type MasterTextField } from "@/lib/masterdata/localize-text";

// Asset-server language codes for the MasterText columns: a locale reads assets in its first text language.
const assetLanguageByField: Readonly<Record<MasterTextField, AssetLanguage>> = {
  simplifiedChinese: "zh-Hans",
  traditionalChinese: "zh-Hant",
  japanese: "ja",
  english: "en",
  korean: "ko",
};

export const ASSET_LANGUAGES: readonly AssetLanguage[] = SERVER_ASSET_LANGUAGES;

export function assetLanguage(locale: AppLocale): AssetLanguage {
  return assetLanguageByField[masterTextFieldOrder(locale)[0]!];
}

/** Every asset-server language code in the locale's text fallback order (the order localizeMasterText reads). */
export function assetLanguageOrder(locale: AppLocale): AssetLanguage[] {
  return masterTextFieldOrder(locale).map((field) => assetLanguageByField[field]);
}

/**
 * Published file by asset path: `/{language}/{key}/{label}.{ext}`. The service maps the path onto the newest
 * export of the key, so new exports appear without rebuilding the site; unexported paths answer 404.
 *
 * The path names the service's default region (`assetConfig.region`, the primary server's). View models keep this
 * server-neutral form, and pages move it to the server they show with serverAssetUrl.
 */
export function releaseFileUrl(key: string, fileName: string, locale: AppLocale): string {
  const segments = [assetLanguage(locale), ...key.split("/"), fileName].map(encodeURIComponent);
  return `${assetConfig.api}/${segments.join("/")}`;
}

/** Path prefix of a server's files: none for the default region, `/{region}` for the others. */
function regionPrefix(server: GameServer): string {
  const region = GAME_SERVER_PROFILES[server].assetRegion;
  return region === assetConfig.region ? "" : `/${encodeURIComponent(region)}`;
}

/**
 * The same file in `server`'s catalog: `/{region}/{language}/{key}/…`. A language the region does not publish
 * becomes its first one (the JP catalog is Japanese only). Other URLs are returned unchanged.
 */
export function serverAssetUrl(url: string, server: GameServer): string {
  const root = `${assetConfig.api}/`;
  if (!url.startsWith(root)) return url;
  const rest = url.slice(root.length);
  const slash = rest.indexOf("/");
  const language = rest.slice(0, slash) as AssetLanguage;
  if (slash < 0 || !ASSET_LANGUAGES.includes(language)) return url;
  const { assetLanguages } = GAME_SERVER_PROFILES[server];
  const published = assetLanguages.includes(language) ? language : assetLanguages[0]!;
  return `${assetConfig.api}${regionPrefix(server)}/${published}${rest.slice(slash)}`;
}

/** The server whose catalog an asset service region is. */
export function serverOfAssetRegion(region: string | undefined): GameServer | undefined {
  return GAME_SERVERS.find((server) => GAME_SERVER_PROFILES[server].assetRegion === region);
}

/** Whether serverAssetUrl changes nothing for `server` (the default region publishing every language). */
function isDefaultCatalog(server: GameServer): boolean {
  const profile = GAME_SERVER_PROFILES[server];
  return profile.assetRegion === assetConfig.region && ASSET_LANGUAGES.every((language) => profile.assetLanguages.includes(language));
}

/** A fetch that requests release URLs from `server`'s catalog (story tables of a server's ADV). */
export function serverReleaseFetcher(server: GameServer, fetcher: typeof fetch = globalThis.fetch): typeof fetch {
  if (isDefaultCatalog(server)) return fetcher;
  return ((input: Request | string | URL, init?: RequestInit) => fetcher(typeof input === "string" ? serverAssetUrl(input, server) : input, init)) as typeof fetch;
}

/** A copy of plain data (a parsed story script) with every release URL in it moved to `server`'s catalog. */
export function moveReleaseUrls<T>(value: T, server: GameServer): T {
  if (isDefaultCatalog(server)) return value;
  const move = (item: unknown): unknown => {
    if (typeof item === "string") return serverAssetUrl(item, server);
    if (Array.isArray(item)) return item.map(move);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, move(entry)]));
    return item;
  };
  return move(value) as T;
}

/** Every path prefix under which the service publishes files (`{api}/{language}`, `{api}/{region}/{language}`). */
export function releaseFilePrefixes(): string[] {
  const prefixes = new Set<string>();
  for (const server of GAME_SERVERS) {
    for (const language of GAME_SERVER_PROFILES[server].assetLanguages) prefixes.add(`${assetConfig.api}${regionPrefix(server)}/${language}`);
  }
  return [...prefixes];
}

export class ReleaseRequestError extends Error {
  constructor(readonly status: number, url: string) {
    super(`Release request failed (HTTP ${status}): ${url}`);
  }
}

/** Server errors and rate limits are retried. */
async function fetchRelease(url: string, fetcher: typeof fetch): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetcher(url);
    } catch (error) {
      if (attempt >= 4) throw error;
    }
    if (response?.ok) return response;
    if (response && ((response.status < 500 && response.status !== 429) || attempt >= 4)) {
      throw new ReleaseRequestError(response.status, url);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}

/** Published JSON (story tables). */
export async function fetchReleaseJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  return (await fetchRelease(url, fetcher)).json() as Promise<T>;
}

/** Published file bytes (music charts, PNG jackets). */
export async function fetchReleaseBytes(url: string, fetcher: typeof fetch): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await (await fetchRelease(url, fetcher)).arrayBuffer());
}

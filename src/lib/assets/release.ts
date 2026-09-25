import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { masterTextFieldOrder, type MasterTextField } from "@/lib/masterdata/localize-text";

// Asset-server language codes for the MasterText columns: a locale reads assets in its first text language.
const assetLanguageByField: Readonly<Record<MasterTextField, string>> = {
  simplifiedChinese: "zh-Hans",
  traditionalChinese: "zh-Hant",
  japanese: "ja",
  english: "en",
  korean: "ko",
};

export const ASSET_LANGUAGES: readonly string[] = Object.values(assetLanguageByField);

export function assetLanguage(locale: AppLocale): string {
  return assetLanguageByField[masterTextFieldOrder(locale)[0]!];
}

/**
 * Published file by asset path: `/{language}/{key}/{label}.{ext}`. The service maps the path onto the newest
 * export of the key, so new exports appear without rebuilding the site; unexported paths answer 404.
 */
export function releaseFileUrl(key: string, fileName: string, locale: AppLocale): string {
  const segments = [assetLanguage(locale), ...key.split("/"), fileName].map(encodeURIComponent);
  return `${assetConfig.api}/${segments.join("/")}`;
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

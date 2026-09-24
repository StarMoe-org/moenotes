import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { masterTextFieldOrder, type MasterTextField } from "@/lib/masterdata/localize-text";

/** Generated index value: one ID when every asset language publishes the same content, otherwise IDs by asset language. */
export type ReleaseEntry = string | Readonly<Record<string, string>>;

// Asset-server language codes for the MasterText columns, so localized artwork follows the same chain as text.
const assetLanguageByField: Readonly<Record<MasterTextField, string>> = {
  simplifiedChinese: "zh-Hans",
  traditionalChinese: "zh-Hant",
  japanese: "ja",
  english: "en",
  korean: "ko",
};

export function selectReleaseId(entry: ReleaseEntry | undefined, locale: AppLocale): string | undefined {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return undefined;
  for (const field of masterTextFieldOrder(locale)) {
    const id = entry[assetLanguageByField[field]];
    if (id) return id;
  }
  return undefined;
}

export function releaseFileUrl(fileId: string): string {
  return `${assetConfig.api}/files/${fileId}`;
}

export function releaseExportUrl(exportId: string): string {
  return `${assetConfig.api}/exports/${exportId}`;
}

/** Published JSON (story tables, export manifests); server errors and rate limits are retried. */
export async function fetchReleaseJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    let response: Response | undefined;
    try {
      response = await fetcher(url);
    } catch (error) {
      if (attempt >= 4) throw error;
    }
    if (response?.ok) return response.json() as Promise<T>;
    if (response && ((response.status < 500 && response.status !== 429) || attempt >= 4)) {
      throw new Error(`Release request failed (HTTP ${response.status}): ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}

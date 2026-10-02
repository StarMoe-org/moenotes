import type { AppLocale } from "@/config/locales";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { ContentSearchEntry } from "@/lib/search/content-index";
import { loadContentSearchIndex } from "@/lib/search/dynamic-index";
import { localizePath } from "@/i18n/routing";

/** One content search hit, localized for the UI locale and ready to render or navigate to. */
export interface ContentSearchResult {
  key: string;
  kind: ContentSearchEntry["kind"];
  title: string;
  /** Localized detail path (locale prefix applied). */
  href: `/${string}`;
}

export { loadContentSearchIndex };

/**
 * Localize every entry's title for `locale` once; matching `query` against that locale's searchText (falling back to
 * English) plus the localized title, so a member or band name lands on their content. Returns entries in index order.
 */
export async function searchContent(query: string, locale: AppLocale): Promise<ContentSearchResult[]> {
  const entries = await loadContentSearchIndex();
  const q = query.trim().toLocaleLowerCase();
  const localizeEntry = (entry: ContentSearchEntry): ContentSearchResult => ({
    key: entry.key,
    kind: entry.kind,
    title: localizeMasterText(entry.title, locale) || entry.title.id || entry.key,
    href: localizePath(entry.href, locale),
  });
  if (!q) return entries.map(localizeEntry);
  return entries
    .filter((entry) => {
      const blob = entry.searchText[locale] ?? entry.searchText["en-US"] ?? "";
      const title = localizeMasterText(entry.title, locale).toLocaleLowerCase();
      return blob.includes(q) || title.includes(q);
    })
    .map(localizeEntry);
}

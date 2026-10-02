import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { buildStaticSearchIndex, type SearchIndexRouteItem } from "@/lib/search/static-index";

/** A searchable static page with its locale-resolved path, for the `/search` result page. */
export interface StaticSearchPageItem extends SearchIndexRouteItem {
  /** `path` with the current locale's prefix, ready to render as a link. */
  localizedPath: `/${string}`;
}

/** The searchable static routes with locale-resolved paths. Labels come from `labelKey` via `t()` at render time. */
export function buildStaticIndexPageItems(locale: AppLocale): StaticSearchPageItem[] {
  return buildStaticSearchIndex().map((item) => ({ ...item, localizedPath: localizePath(item.path, locale) }));
}

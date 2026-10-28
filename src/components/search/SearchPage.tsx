"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { Icon } from "@/components/shared/icons";
import { stripLocaleFromPathname } from "@/i18n/routing";
import { searchContent, type ContentSearchResult } from "@/lib/search/client";
import { CONTENT_KIND_ORDER, KIND_LABEL_KEY } from "@/lib/search/kinds";
import { buildStaticIndexPageItems, type StaticSearchPageItem } from "@/lib/search/static-page-items";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
}

function readQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

/** `/search?q=…`: every static page plus the content index, grouped by kind, filterable by kind. */
export default function SearchPage({ locale }: Props) {
  const [query, setQuery] = useState(readQuery);
  const [activeKind, setActiveKind] = useState<ContentSearchResult["kind"] | "all">("all");
  const staticItems = useMemo(() => buildStaticIndexPageItems(locale), [locale]);
  const [content, setContent] = useState<ContentSearchResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    void searchContent(query, locale).then((results) => { if (!cancelled) setContent(results); });
    return () => { cancelled = true; };
  }, [query, locale]);

  // Static pages filtered the same way as content, on their localized label + path + keywords.
  const q = query.trim().toLocaleLowerCase();
  const matchedStatic = useMemo(() => {
    if (!q) return [] as StaticSearchPageItem[];
    return staticItems.filter((item) =>
      [t(locale, item.labelKey), item.path, ...item.keywords].some((value) => value.toLocaleLowerCase().includes(q)));
  }, [staticItems, locale, q]);

  const { showSpoiler, now } = useSpoilerSetting();
  const visibleContent = useMemo(() => {
    if (showSpoiler || now === null) return content;
    return content.filter((result) => !isSpoiler(result.startAt, now));
  }, [content, showSpoiler, now]);

  const grouped = useMemo(() => {
    const byKind = new Map<ContentSearchResult["kind"], ContentSearchResult[]>();
    for (const kind of CONTENT_KIND_ORDER) byKind.set(kind, []);
    for (const result of visibleContent) byKind.get(result.kind)?.push(result);
    return CONTENT_KIND_ORDER.map((kind) => ({ kind, results: byKind.get(kind) ?? [] })).filter(({ results }) => results.length > 0);
  }, [visibleContent]);

  const presentKinds = useMemo(() => grouped.map(({ kind }) => kind), [grouped]);
  const visibleGroups = activeKind === "all" ? grouped : grouped.filter(({ kind }) => kind === activeKind);
  const showStatic = q && (activeKind === "all") && matchedStatic.length > 0;
  const empty = q && !showStatic && visibleGroups.length === 0;

  const setKind = (kind: ContentSearchResult["kind"] | "all") => setActiveKind(kind);

  return (
    <div>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t(locale, "search.placeholder")}
          aria-label={t(locale, "search.placeholder")}
          className="md3-text-field md3-search-field !h-14 !pl-14 !pr-5 text-title-medium"
        />
      </div>

      {q && presentKinds.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t(locale, "search.filterByKind")}>
          <button
            type="button"
            onClick={() => setKind("all")}
            aria-pressed={activeKind === "all"}
            className="md3-filter-chip md3-state"
          >
            {t(locale, "search.kinds.all")}
          </button>
          {presentKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setKind(kind)}
              aria-pressed={activeKind === kind}
              className="md3-filter-chip md3-state"
            >
              {t(locale, KIND_LABEL_KEY[kind])}
            </button>
          ))}
        </div>
      ) : null}

      {empty ? (
        <p className="px-4 py-12 text-center text-label-large text-on-surface-variant">{t(locale, "search.noResults")}</p>
      ) : (
        <div className="mt-6 space-y-8">
          {showStatic ? (
            <section>
              <h2 className="mb-3 text-label-medium text-on-surface-variant">{t(locale, "search.kinds.page")}</h2>
              <ul className="space-y-1.5">
                {matchedStatic.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.localizedPath}
                      className="md3-state block min-h-14 rounded-full px-4 py-3 text-body-large text-on-surface"
                    >
                      <span className="font-black text-on-surface">{t(locale, item.labelKey)}</span>
                      <span className="ml-3 text-label-medium text-on-surface-variant">{stripLocaleFromPathname(item.path)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {visibleGroups.map(({ kind, results }) => (
            <section key={kind}>
              <h2 className="mb-3 text-label-medium text-on-surface-variant">{t(locale, KIND_LABEL_KEY[kind])}</h2>
              <ul className="space-y-1.5">
                {results.map((result) => (
                  <li key={result.key}>
                    <a
                      href={result.href}
                      className="md3-state block min-h-14 rounded-full px-4 py-3 text-body-large text-on-surface"
                    >
                      <span className="font-black text-on-surface">{result.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

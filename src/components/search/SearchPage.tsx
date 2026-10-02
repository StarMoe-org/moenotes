import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { stripLocaleFromPathname } from "@/i18n/routing";
import { searchContent, type ContentSearchResult } from "@/lib/search/client";
import { buildStaticIndexPageItems, type StaticSearchPageItem } from "@/lib/search/static-page-items";

interface Props {
  locale: AppLocale;
}

const KIND_ORDER: ContentSearchResult["kind"][] = [
  "character",
  "card",
  "support-card",
  "music",
  "story",
  "gacha",
  "event",
  "reward",
];

const KIND_LABEL_KEY: Record<ContentSearchResult["kind"], string> = {
  character: "search.kinds.character",
  card: "search.kinds.card",
  "support-card": "search.kinds.supportCard",
  music: "search.kinds.music",
  story: "search.kinds.story",
  gacha: "search.kinds.gacha",
  event: "search.kinds.event",
  reward: "search.kinds.reward",
};

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

  const grouped = useMemo(() => {
    const byKind = new Map<ContentSearchResult["kind"], ContentSearchResult[]>();
    for (const kind of KIND_ORDER) byKind.set(kind, []);
    for (const result of content) byKind.get(result.kind)?.push(result);
    return KIND_ORDER.map((kind) => ({ kind, results: byKind.get(kind) ?? [] })).filter(({ results }) => results.length > 0);
  }, [content]);

  const presentKinds = useMemo(() => grouped.map(({ kind }) => kind), [grouped]);
  const visibleGroups = activeKind === "all" ? grouped : grouped.filter(({ kind }) => kind === activeKind);
  const showStatic = q && (activeKind === "all") && matchedStatic.length > 0;
  const empty = q && !showStatic && visibleGroups.length === 0;

  const setKind = (kind: ContentSearchResult["kind"] | "all") => setActiveKind(kind);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder={t(locale, "search.placeholder")}
        aria-label={t(locale, "search.placeholder")}
        className="w-full rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-5 py-3.5 text-lg font-bold text-[var(--mn-text)] outline-none placeholder:text-[var(--mn-text-muted)]"
      />

      {q && presentKinds.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t(locale, "search.filterByKind")}>
          <button
            type="button"
            onClick={() => setKind("all")}
            aria-pressed={activeKind === "all"}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${activeKind === "all" ? "border-[var(--mn-border)] bg-[var(--mn-cream-deep)]" : "border-transparent text-[var(--mn-text-muted)]"}`}
          >
            {t(locale, "search.kinds.all")}
          </button>
          {presentKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setKind(kind)}
              aria-pressed={activeKind === kind}
              className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${activeKind === kind ? "border-[var(--mn-border)] bg-[var(--mn-cream-deep)]" : "border-transparent text-[var(--mn-text-muted)]"}`}
            >
              {t(locale, KIND_LABEL_KEY[kind])}
            </button>
          ))}
        </div>
      ) : null}

      {empty ? (
        <p className="px-4 py-12 text-center text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "search.noResults")}</p>
      ) : (
        <div className="mt-6 space-y-8">
          {showStatic ? (
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">{t(locale, "search.kinds.page")}</h2>
              <ul className="space-y-1.5">
                {matchedStatic.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.localizedPath}
                      className="mn-command-option block rounded-2xl border-2 border-transparent px-5 py-3 text-sm hover:border-[var(--mn-border)] hover:bg-[var(--mn-cream-deep)]"
                    >
                      <span className="font-black text-[var(--mn-text)]">{t(locale, item.labelKey)}</span>
                      <span className="ml-3 text-xs font-bold text-[var(--mn-text-muted)]">{stripLocaleFromPathname(item.path)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {visibleGroups.map(({ kind, results }) => (
            <section key={kind}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">{t(locale, KIND_LABEL_KEY[kind])}</h2>
              <ul className="space-y-1.5">
                {results.map((result) => (
                  <li key={result.key}>
                    <a
                      href={result.href}
                      className="mn-command-option block rounded-2xl border-2 border-transparent px-5 py-3 text-sm hover:border-[var(--mn-border)] hover:bg-[var(--mn-cream-deep)]"
                    >
                      <span className="font-black text-[var(--mn-text)]">{result.title}</span>
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

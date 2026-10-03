import { useEffect, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import type { DetailNeighbors } from "@/lib/route/detail-neighbors";
import { getRoutePathById } from "@/lib/route/registry";
import { readQueryParam, safeReturnPath } from "@/lib/route/url-state";

export interface EntityPagerProps extends DetailNeighbors {
  locale: AppLocale;
  /** Route id of the list page "Back to list" falls back to (e.g. "cards"). */
  listRouteId: string;
  /** Query parameter carrying the page to go back to (default `return`). */
  returnParam?: string;
  className?: string;
}

/**
 * "Previous / Back to list / Next" for a detail page. Neighbor hrefs are locale-free (from detailNeighbors). Back to
 * list follows `?return=` when it is a same-site path (one leading `/`), else the list route.
 */
export default function EntityPager({ locale, previous, next, listRouteId, returnParam = "return", className = "" }: EntityPagerProps) {
  const listHref = localizePath(getRoutePathById(listRouteId), locale);
  // The static HTML links to the list; the browser then honours `?return=`.
  const [backHref, setBackHref] = useState<string>(listHref);
  useEffect(() => {
    setBackHref(safeReturnPath(readQueryParam(returnParam)) ?? listHref);
  }, [returnParam, listHref]);

  const card = "mn-focus group flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-2.5 shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 hover:border-[var(--mn-accent)] hover:shadow-[var(--mn-shadow-stamp)]";
  const arrow = "h-4 w-4 shrink-0 text-[var(--mn-accent-deep)] transition group-hover:scale-110";

  return (
    <nav aria-label={t(locale, "detailNav.label")} className={`grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3 ${className}`}>
      {previous ? (
        <a href={localizePath(previous.href, locale)} rel="prev" className={card}>
          <svg className={arrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">{t(locale, "detailNav.previous")}</span>
            <span className="block truncate text-sm font-bold text-[var(--mn-text)]">{previous.title}</span>
          </span>
        </a>
      ) : <span aria-hidden="true" />}
      <a href={backHref} className={`${card} justify-center px-3 sm:px-4`} title={t(locale, "detailNav.backToList")}>
        <svg className={arrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        <span className="hidden whitespace-nowrap text-sm font-bold text-[var(--mn-text)] sm:inline">{t(locale, "detailNav.backToList")}</span>
        <span className="sr-only sm:hidden">{t(locale, "detailNav.backToList")}</span>
      </a>
      {next ? (
        <a href={localizePath(next.href, locale)} rel="next" className={`${card} justify-end text-right`}>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">{t(locale, "detailNav.next")}</span>
            <span className="block truncate text-sm font-bold text-[var(--mn-text)]">{next.title}</span>
          </span>
          <svg className={arrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </a>
      ) : <span aria-hidden="true" />}
    </nav>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import BannerImage from "@/components/shared/BannerImage";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useAssetUrl, useServerList, useServerOnlyLabel } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import type { ExchangeCategoryViewModel, ExchangeSummaryViewModel } from "@/lib/exchange/data";
import { exchangePath } from "@/lib/exchange/links";
import { formatScheduleRange } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  initialCategories: ServerFaceted<ExchangeCategoryViewModel>[];
  servers: GameServer[];
}

/** The shops by category; each shop's products are on its own page (`/events/exchange/:id`). */
export default function ExchangeExplorer({ locale, servers, initialCategories }: Props) {
  const { server, pickServer, items: categories } = useServerList(locale, servers, initialCategories);
  const timeZone = useDisplayTimeZone();
  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const serverOnly = useServerOnlyLabel(locale);
  const [activeId, setActiveId] = useState<number | null>(null);

  const visibleCategories = useMemo(() => {
    if (showSpoiler || now === null) return categories;
    return categories
      .map((category) => ({
        ...category,
        exchanges: category.exchanges.filter((exchange) => !isSpoiler(exchange.startAt, now)),
      }))
      .filter((category) => category.exchanges.length > 0);
  }, [categories, showSpoiler, now]);

  const active = activeId === null ? visibleCategories : visibleCategories.filter((category) => category.id === activeId);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <nav aria-label={t(locale, "exchange.categories")} className="mn-scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <CategoryTab active={activeId === null} onClick={() => setActiveId(null)} label={t(locale, "exchange.categories")} />
        {categories.map((category) => (
          <CategoryTab key={category.id} active={activeId === category.id} onClick={() => setActiveId(category.id)} label={category.name} />
        ))}
      </nav>
      <div className="mt-5 space-y-10">
        {active.map((category) => (
          <section key={category.id} aria-labelledby={`exchange-category-${category.id}`}>
            <CategoryHeading category={category} note={serverOnly(category)} />
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
              {category.exchanges.map((exchange) => (
                <li key={exchange.id} className="min-w-0">
                  <ExchangeCard exchange={exchange} locale={locale} timeZone={timeZone} now={now} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {categories.length === 0 ? (
          <p className="md3-surface p-8 text-center text-body-medium text-on-surface-variant">{t(locale, "exchange.pageDescription")}</p>
        ) : null}
      </div>
    </ServerScope>
  );
}

function CategoryTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`md3-state shrink-0 rounded-full border px-4 py-2 text-label-medium transition sm:text-label-large ${ active ? "border-primary bg-primary text-on-primary shadow-elevation-1" : "border-outline-variant bg-surface-container-low text-on-surface hover:border-primary/50" }`}
    >
      {label}
    </button>
  );
}

/** The category's portrait tile (the game's entry card) beside its name. */
function CategoryHeading({ category, note }: { category: ExchangeCategoryViewModel; note: string | undefined }) {
  const iconUrl = useAssetUrl()(category.iconUrl);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-end gap-3">
      {iconUrl && !failed ? (
        <img
          src={iconUrl}
          alt=""
          width={356}
          height={446}
          loading="lazy"
          className="h-16 w-auto shrink-0 rounded-shape-sm border border-outline-variant/40 object-contain sm:h-20"
          onError={() => setFailed(true)}
        />
      ) : null}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`exchange-category-${category.id}`} className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">{category.name}</h2>
        {note ? <span className="text-label-medium text-on-surface-variant">{note}</span> : null}
      </div>
    </div>
  );
}

/** One shop: banner (or its name on a plain tile), status, currency, product count and window; links to its page. */
function ExchangeCard({ exchange, locale, timeZone, now }: { exchange: ExchangeSummaryViewModel; locale: AppLocale; timeZone: string | null; now: number | null }) {
  const currencyUrl = useAssetUrl()(exchange.currency.imageUrl);
  const [currencyFailed, setCurrencyFailed] = useState(false);
  const schedule = formatScheduleRange(exchange.startAt, exchange.endAt, locale, timeZone) || t(locale, "exchange.alwaysOpen");
  return (
    <a
      href={localizePath(exchangePath(exchange.id), locale)}
      className="mn-list-card group flex h-full min-w-0 flex-col overflow-hidden border border-outline-variant bg-surface-container-low shadow-elevation-1 transition hover:shadow-elevation-1"
      data-list-item-id={exchange.id}
      aria-label={t(locale, "exchange.openDetail", { name: exchange.name })}
    >
      <div className="relative border-b border-outline-variant">
        <BannerImage src={exchange.bannerUrl} alt="" fallback={exchange.name} />
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
          <ScheduleBadge locale={locale} startAt={exchange.startAt} endAt={exchange.endAt} now={now} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <h3 className="line-clamp-2 text-label-large leading-5 text-on-surface transition-colors group-hover:text-primary">{exchange.name}</h3>
        <p className="truncate text-body-small tabular-nums text-on-surface-variant">{schedule}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1.5 text-body-small text-on-surface-variant">
          {exchange.currency.name ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              {currencyUrl && !currencyFailed ? <img src={currencyUrl} alt="" loading="lazy" className="h-4 w-4 shrink-0 object-contain" onError={() => setCurrencyFailed(true)} /> : null}
              <span className="truncate font-bold text-on-surface">{exchange.currency.name}</span>
            </span>
          ) : <span />}
          <span className="shrink-0">{t(locale, "exchange.productCount", { count: exchange.productCount })}</span>
        </div>
      </div>
    </a>
  );
}

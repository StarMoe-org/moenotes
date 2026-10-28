"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import DetailHero from "@/components/shared/DetailHero";
import { DetailRow } from "@/components/shared/DetailRows";
import ServerSchedules from "@/components/shared/ServerSchedules";
import TimesNote from "@/components/shared/TimesNote";
import BannerImage from "@/components/shared/BannerImage";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import type { ExchangeCurrency, ExchangeDetailViewModel, ExchangeProductViewModel } from "@/lib/exchange/data";
import { eventPath } from "@/lib/events/links";
import { buildDynamicPath, getRoutePathById } from "@/lib/route/registry";
import { entityLinkPath } from "@/lib/route/entity-link";
import { formatMasterDate, formatScheduleRange } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import SpoilerNotice from "@/components/shared/SpoilerNotice";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  exchange: ServerFacetedValue<ExchangeDetailViewModel> | null;
  servers: GameServer[];
}

const panelHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--md-ref-typeface-brand)] text-xl text-on-surface sm:text-2xl";
const backLink = "md3-button md3-button--tonal";

/** The shop as the page's server has it (docs/servers.md). */
export default function ExchangeDetail({ locale, exchange: faceted, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const exchange = useMemo(() => faceted && moveReleaseUrls(valueForServer(faceted, server), entityServer(faceted, server)), [faceted, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} hideSwitch>
      <ExchangeDetailView
        locale={locale}
        serverSwitch={serverSwitch}
        exchange={exchange}
        schedules={faceted && <ServerSchedules locale={locale} faceted={faceted} servers={servers} alwaysLabel={t(locale, "exchange.alwaysOpen")} />}
      />
    </ServerScope>
  );
}

function ExchangeDetailView({ locale, exchange, serverSwitch, schedules }: { locale: AppLocale; serverSwitch: ReactNode; exchange: ExchangeDetailViewModel | null; schedules: ReactNode }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const { showSpoiler } = useSpoiler();
  const isUnreleased = Boolean(exchange?.startAt && isSpoiler(exchange.startAt, now));

  if (!exchange) return <NotFound locale={locale} />;
  if (!showSpoiler && isUnreleased) return <SpoilerNotice locale={locale} />;

  const schedule = formatScheduleRange(exchange.startAt, exchange.endAt, locale, timeZone) || t(locale, "exchange.alwaysOpen");
  const limited = exchange.products.filter((product) => product.limitCount > 0).length;
  const facts: Array<[string, ReactNode]> = [
    [t(locale, "exchange.detail.category"), exchange.categoryName],
    [t(locale, "exchange.currency"), <CurrencyLabel locale={locale} currency={exchange.currency} />],
    [t(locale, "exchange.detail.period"), <span className="tabular-nums">{schedule}</span>],
    [t(locale, "exchange.detail.products"), t(locale, "exchange.productCount", { count: exchange.products.length })],
  ];
  if (exchange.relation) facts.push([t(locale, `exchange.detail.relation.${exchange.relation.kind}`), <RelationLink locale={locale} relation={exchange.relation} />]);
  if (limited > 0) {
    facts.push([
      t(locale, exchange.limitedTotalResets ? "exchange.detail.limitedTotalPerReset" : "exchange.detail.limitedTotal"),
      <Price locale={locale} currency={exchange.currency} amount={exchange.limitedTotal} />,
    ]);
  }

  return (
    <div className="w-full space-y-8">
      <DetailHero title={exchange.name} aside={serverSwitch} eyebrow={<ScheduleBadge locale={locale} startAt={exchange.startAt} endAt={exchange.endAt} now={now} />} />

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          {/* The shop banners are 420×180: kept at most at their own width rather than blown up across the column. */}
          <div className="md3-surface p-4">
            <BannerImage eager className="mx-auto max-w-[420px] rounded-shape-md border border-outline-variant" src={exchange.bannerUrl} alt={exchange.name} fallback={exchange.name} />
          </div>
          <div className="md3-surface overflow-hidden">
            <dl className="divide-y divide-outline-variant px-6">
              {facts.map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}
            </dl>
            <TimesNote locale={locale} value={exchange.startAt || exchange.endAt} timeZone={timeZone} className="px-6 pb-5 text-body-small text-on-surface-variant" />
            <div className="px-6 pb-5 empty:hidden">{schedules}</div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <ProductPanel locale={locale} exchange={exchange} timeZone={timeZone} />
          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("exchange"), locale)} className={backLink}>{t(locale, "exchange.detail.backToList")}</a>
          </div>
        </section>
      </div>
    </div>
  );
}

type ProductFilter = "all" | "limited" | "unlimited";

function ProductPanel({ locale, exchange, timeZone }: { locale: AppLocale; exchange: ExchangeDetailViewModel; timeZone: string | null }) {
  const hasBoth = exchange.products.some((product) => product.limitCount > 0) && exchange.products.some((product) => product.limitCount === 0);
  const [filter, setFilter] = useState<ProductFilter>("all");
  const products = exchange.products.filter((product) => filter === "all" || (filter === "limited") === (product.limitCount > 0));
  const filters: ProductFilter[] = ["all", "limited", "unlimited"];
  return (
    <div className="md3-surface overflow-hidden">
      <div className={panelHeader}>
        <h3 className={panelTitle}>{t(locale, "exchange.detail.products")}</h3>
        {hasBoth && (
          <div className="flex max-w-full flex-wrap gap-1 rounded-full border border-outline-variant bg-surface-container-high p-1" role="group" aria-label={t(locale, "exchange.detail.productFilter")}>
            {filters.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                aria-pressed={filter === option}
                className={`rounded-full px-3 py-1 text-label-medium transition ${filter === option ? "bg-secondary-container text-primary" : "text-on-surface-variant hover:bg-surface-container-highest"}`}
              >
                {t(locale, `exchange.detail.filters.${option}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <ol className="divide-y divide-dashed divide-outline-variant/60 px-4 sm:px-6">
        {products.map((product) => (
          <ProductRow key={product.id} locale={locale} product={product} currency={exchange.currency} timeZone={timeZone} />
        ))}
      </ol>
    </div>
  );
}

function ProductRow({ locale, product, currency, timeZone }: { locale: AppLocale; product: ExchangeProductViewModel; currency: ExchangeCurrency; timeZone: string | null }) {
  const limit = product.limitCount === 0
    ? t(locale, "exchange.product.unlimited")
    : [product.limitReset ? t(locale, `exchange.product.${product.limitReset}`) : "", t(locale, "exchange.product.limit", { count: product.limitCount })].filter(Boolean).join(" ");
  const start = formatMasterDate(product.startAt, locale, true, timeZone);
  const end = formatMasterDate(product.endAt, locale, true, timeZone);
  return (
    <li className="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <RewardChip reward={product.reward} locale={locale} />
        {product.isRecommended && (
          <span className="rounded-full border border-primary/30 bg-primary px-2 py-0.5 text-label-small text-on-primary">
            {t(locale, "exchange.product.recommended")}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-small sm:flex-col sm:items-end sm:gap-1">
        <Price locale={locale} currency={currency} amount={product.price} />
        <span className="font-medium text-on-surface-variant">{limit}</span>
        {product.priceSteps.length > 0 && (
          <span className="font-medium tabular-nums text-on-surface-variant">
            {product.priceSteps.map((step) => t(locale, "exchange.detail.priceStep", { from: step.from, price: step.price.toLocaleString(locale) })).join(" · ")}
          </span>
        )}
        {(start || end) && <span className="tabular-nums text-label-small text-on-surface-variant">{[start, end].filter(Boolean).join(" – ")}</span>}
      </div>
    </li>
  );
}

function CurrencyIcon({ currency }: { currency: ExchangeCurrency }) {
  const src = useAssetUrl()(currency.imageUrl);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img src={src} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" onError={() => setFailed(true)} />;
}

function CurrencyLabel({ locale, currency }: { locale: AppLocale; currency: ExchangeCurrency }) {
  const content = (
    <>
      <CurrencyIcon currency={currency} />
      <span>{currency.name || "—"}</span>
    </>
  );
  return currency.link
    ? <a href={localizePath(entityLinkPath(currency.link), locale)} className="inline-flex items-center gap-1.5 hover:text-primary">{content}</a>
    : <span className="inline-flex items-center gap-1.5">{content}</span>;
}

function Price({ locale, currency, amount }: { locale: AppLocale; currency: ExchangeCurrency; amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-label-large tabular-nums text-primary" title={currency.name || undefined}>
      <CurrencyIcon currency={currency} />
      {amount.toLocaleString(locale)}
    </span>
  );
}

function RelationLink({ locale, relation }: { locale: AppLocale; relation: NonNullable<ExchangeDetailViewModel["relation"]> }) {
  const path = relation.kind === "event" ? eventPath(relation.id) : buildDynamicPath(getRoutePathById("gacha-detail"), { id: String(relation.id) });
  return <a href={localizePath(path, locale)} className="underline decoration-dotted underline-offset-4 hover:text-primary">{relation.name}</a>;
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="md3-surface p-8 text-center sm:p-12">
      <h1 className="text-headline-small text-on-surface">{t(locale, "exchange.detail.notFoundTitle")}</h1>
      <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "exchange.detail.notFoundDescription")}</p>
      <a href={localizePath(getRoutePathById("exchange"), locale)} className={`${backLink} mt-6`}>{t(locale, "exchange.detail.backToList")}</a>
    </div>
  );
}

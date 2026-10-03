import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
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
import { formatMasterDate, formatScheduleRange } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";

interface Props {
  locale: AppLocale;
  exchange: ServerFacetedValue<ExchangeDetailViewModel> | null;
  servers: GameServer[];
}

const panelHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl";
const backLink = "mn-focus mn-stamp-press inline-flex rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]";

/** The shop as the page's server has it (docs/servers.md). */
export default function ExchangeDetail({ locale, exchange: faceted, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const exchange = useMemo(() => faceted && moveReleaseUrls(valueForServer(faceted, server), entityServer(faceted, server)), [faceted, server]);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []}>
      <ExchangeDetailView
        locale={locale}
        exchange={exchange}
        schedules={faceted && <ServerSchedules locale={locale} faceted={faceted} servers={servers} alwaysLabel={t(locale, "exchange.alwaysOpen")} />}
      />
    </ServerScope>
  );
}

function ExchangeDetailView({ locale, exchange, schedules }: { locale: AppLocale; exchange: ExchangeDetailViewModel | null; schedules: ReactNode }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  if (!exchange) return <NotFound locale={locale} />;

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
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          {/* The shop banners are 420×180: kept at most at their own width rather than blown up across the column. */}
          <div className="rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-4 shadow-[var(--mn-shadow-stamp-lg)]">
            <BannerImage eager className="mx-auto max-w-[420px] rounded-xl border border-[var(--mn-glass-border)]" src={exchange.bannerUrl} alt={exchange.name} fallback={exchange.name} />
          </div>
          <div className="mn-paper overflow-hidden">
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent p-6">
              <ScheduleBadge locale={locale} startAt={exchange.startAt} endAt={exchange.endAt} now={now} />
              <h2 className="mt-3 font-[var(--mn-font-display)] text-2xl leading-tight text-[var(--mn-text)] sm:text-3xl">{exchange.name}</h2>
            </div>
            <div className="divide-y divide-dashed divide-[var(--mn-border)]/60 px-6 py-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <span className="shrink-0 font-semibold text-[var(--mn-text-muted)]">{label}</span>
                  <span className="min-w-0 text-right font-semibold text-[var(--mn-text)]">{value}</span>
                </div>
              ))}
            </div>
            <TimesNote locale={locale} value={exchange.startAt || exchange.endAt} timeZone={timeZone} className="px-6 pb-5 text-xs text-[var(--mn-text-muted)]" />
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
    <div className="mn-paper overflow-hidden">
      <div className={panelHeader}>
        <h3 className={panelTitle}>{t(locale, "exchange.detail.products")}</h3>
        {hasBoth && (
          <div className="flex max-w-full flex-wrap gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={t(locale, "exchange.detail.productFilter")}>
            {filters.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                aria-pressed={filter === option}
                className={`mn-focus rounded-full px-3 py-1 text-xs font-bold transition ${filter === option ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
              >
                {t(locale, `exchange.detail.filters.${option}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <ol className="divide-y divide-dashed divide-[var(--mn-border)]/60 px-4 sm:px-6">
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
          <span className="rounded-full border border-[var(--mn-accent-deep)]/30 bg-[var(--mn-accent-deep)] px-2 py-0.5 text-[10px] font-bold leading-none text-[var(--mn-paper)]">
            {t(locale, "exchange.product.recommended")}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:flex-col sm:items-end sm:gap-1">
        <Price locale={locale} currency={currency} amount={product.price} />
        <span className="font-medium text-[var(--mn-text-muted)]">{limit}</span>
        {product.priceSteps.length > 0 && (
          <span className="font-medium tabular-nums text-[var(--mn-text-muted)]">
            {product.priceSteps.map((step) => t(locale, "exchange.detail.priceStep", { from: step.from, price: step.price.toLocaleString(locale) })).join(" · ")}
          </span>
        )}
        {(start || end) && <span className="tabular-nums text-[11px] text-[var(--mn-text-muted)]">{[start, end].filter(Boolean).join(" – ")}</span>}
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
    ? <a href={localizePath(getRoutePathById(currency.link.routeId), locale)} className="mn-focus inline-flex items-center gap-1.5 hover:text-[var(--mn-accent-deep)]">{content}</a>
    : <span className="inline-flex items-center gap-1.5">{content}</span>;
}

function Price({ locale, currency, amount }: { locale: AppLocale; currency: ExchangeCurrency; amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm font-black tabular-nums text-[var(--mn-accent-deep)]" title={currency.name || undefined}>
      <CurrencyIcon currency={currency} />
      {amount.toLocaleString(locale)}
    </span>
  );
}

function RelationLink({ locale, relation }: { locale: AppLocale; relation: NonNullable<ExchangeDetailViewModel["relation"]> }) {
  const path = relation.kind === "event" ? eventPath(relation.id) : buildDynamicPath(getRoutePathById("gacha-detail"), { id: String(relation.id) });
  return <a href={localizePath(path, locale)} className="mn-focus underline decoration-dotted underline-offset-4 hover:text-[var(--mn-accent-deep)]">{relation.name}</a>;
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "exchange.detail.notFoundTitle")}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "exchange.detail.notFoundDescription")}</p>
      <a href={localizePath(getRoutePathById("exchange"), locale)} className={`${backLink} mt-6`}>{t(locale, "exchange.detail.backToList")}</a>
    </div>
  );
}

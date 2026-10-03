import { useMemo, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import EntityPager from "@/components/shared/EntityPager";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import ServerSchedules from "@/components/shared/ServerSchedules";
import ServerScope from "@/components/shared/ServerScope";
import TimesNote from "@/components/shared/TimesNote";
import ShopPrice, { shopLimitLabel } from "@/components/shop/ShopPrice";
import ShopThumbnail from "@/components/shop/ShopThumbnail";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { moveReleaseUrls } from "@/lib/assets/release";
import type { DetailNeighbors } from "@/lib/route/detail-neighbors";
import { entityLinkPath } from "@/lib/route/entity-link";
import { formatScheduleRange } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useContentServer } from "@/lib/servers/use-content-server";
import { formatShopPrice, orderShopPrices, type ShopDetailViewModel } from "@/lib/shop/data";

interface Props {
  locale: AppLocale;
  shop: ServerFacetedValue<ShopDetailViewModel> | null;
  servers: GameServer[];
  neighbors?: DetailNeighbors | undefined;
}

const panelHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl";

/** One shop pack as the page's server sells it (docs/servers.md). */
export default function ShopDetail({ locale, shop: faceted, servers, neighbors }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const shop = useMemo(() => faceted && moveReleaseUrls(valueForServer(faceted, server), entityServer(faceted, server)), [faceted, server]);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []}>
      <ShopDetailView
        locale={locale}
        shop={shop}
        schedules={faceted && <ServerSchedules locale={locale} faceted={faceted} servers={servers} alwaysLabel={t(locale, "shop.alwaysOpen")} />}
      />
      <EntityPager locale={locale} listRouteId="shop" {...neighbors} className="mt-8" />
    </ServerScope>
  );
}

function ShopDetailView({ locale, shop, schedules }: { locale: AppLocale; shop: ShopDetailViewModel | null; schedules: ReactNode }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  if (!shop) return <NotFound locale={locale} />;

  const schedule = formatScheduleRange(shop.startAt, shop.endAt, locale, timeZone) || t(locale, "shop.alwaysOpen");
  const facts: Array<[string, ReactNode]> = [
    [t(locale, "shop.payment"), t(locale, `shop.payments.${shop.payment.kind}`)],
    [t(locale, "shop.price"), <ShopPrice locale={locale} payment={shop.payment} />],
    [t(locale, "shop.limit"), shopLimitLabel(locale, shop)],
    [t(locale, "shop.period"), <span className="tabular-nums">{schedule}</span>],
  ];
  if (shop.vipRank > 0) {
    facts.push([t(locale, "shop.vipRank"), (
      <a href={localizePath(entityLinkPath({ routeId: "tgw-card", query: { rank: String(shop.vipRank) } }), locale)} className="mn-focus underline decoration-dotted underline-offset-4 hover:text-[var(--mn-accent-deep)]">
        {t(locale, "shop.vipRankValue", { rank: shop.vipRank })}
      </a>
    )]);
  }
  if (shop.playerRank > 1) facts.push([t(locale, "shop.playerRank"), t(locale, "shop.playerRankValue", { rank: shop.playerRank })]);
  facts.push([t(locale, "shop.shopId"), `#${shop.id}`]);

  const items = shop.products.filter((product) => !product.isBonus);
  const bonuses = shop.products.filter((product) => product.isBonus);
  const prices = shop.payment.kind === "money" ? orderShopPrices(shop.payment.prices, locale) : [];

  return (
    <div className="w-full space-y-8">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-4 shadow-[var(--mn-shadow-stamp-lg)]">
            <ShopThumbnail eager className="rounded-xl" src={shop.thumbnailUrl} alt={shop.name} fallback={shop.name} />
          </div>
          <div className="mn-paper overflow-hidden">
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent p-6">
              <div className="flex flex-wrap items-center gap-2">
                <ScheduleBadge locale={locale} startAt={shop.startAt} endAt={shop.endAt} now={now} />
                <ScheduleCountdown locale={locale} startAt={shop.startAt} endAt={shop.endAt} now={now} />
              </div>
              <h2 className="mt-3 font-[var(--mn-font-display)] text-2xl leading-tight text-[var(--mn-text)] sm:text-3xl">{shop.name}</h2>
            </div>
            <div className="divide-y divide-dashed divide-[var(--mn-border)]/60 px-6 py-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <span className="shrink-0 font-semibold text-[var(--mn-text-muted)]">{label}</span>
                  <span className="min-w-0 text-right font-semibold text-[var(--mn-text)]">{value}</span>
                </div>
              ))}
            </div>
            <TimesNote locale={locale} value={shop.startAt || shop.endAt} timeZone={timeZone} className="px-6 pb-5 text-xs text-[var(--mn-text-muted)]" />
            <div className="px-6 pb-5 empty:hidden">{schedules}</div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <div className="mn-paper overflow-hidden">
            <div className={panelHeader}><h3 className={panelTitle}>{t(locale, "shop.contents")}</h3></div>
            {shop.products.length === 0 ? (
              <p className="p-6 text-sm text-[var(--mn-text-muted)]">{t(locale, "shop.noContents")}</p>
            ) : (
              <ul className="divide-y divide-dashed divide-[var(--mn-border)]/60 px-4 sm:px-6">
                {[...items, ...bonuses].map((product) => (
                  <li key={product.id} className="flex flex-wrap items-center gap-2 py-3.5">
                    <RewardChip reward={product.reward} locale={locale} />
                    {product.isBonus && (
                      <span className="rounded-full border border-[var(--mn-accent-deep)]/30 bg-[var(--mn-accent-soft)] px-2 py-0.5 text-[10px] font-bold leading-none text-[var(--mn-accent-deep)]">{t(locale, "shop.bonus")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {prices.length > 0 && (
            <div className="mn-paper overflow-hidden">
              <div className={panelHeader}><h3 className={panelTitle}>{t(locale, "shop.storePrices")}</h3></div>
              <dl className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-6">
                {prices.map((price) => (
                  <div key={price.currency} className="rounded-xl border border-[var(--mn-glass-border)] bg-[var(--mn-surface)] p-3">
                    <dt className="text-xs font-bold text-[var(--mn-text-muted)]">{t(locale, `shop.currencies.${price.currency}`)}</dt>
                    <dd className="mt-1 font-mono text-base font-black tabular-nums text-[var(--mn-text)]">{formatShopPrice(price, locale)}</dd>
                  </div>
                ))}
              </dl>
              <p className="px-6 pb-5 text-xs leading-6 text-[var(--mn-text-muted)]">{t(locale, "shop.storePricesNote")}</p>
            </div>
          )}

          {shop.description && (
            <div className="mn-paper overflow-hidden">
              <div className={panelHeader}><h3 className={panelTitle}>{t(locale, "shop.description")}</h3></div>
              <p className="whitespace-pre-line p-6 text-sm leading-7 text-[var(--mn-text-muted)]">{shop.description}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "shop.notFoundTitle")}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "shop.notFoundDescription")}</p>
    </div>
  );
}

"use client";

import { useMemo, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import EntityPager from "@/components/shared/EntityPager";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ServerSchedules from "@/components/shared/ServerSchedules";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import DetailHero from "@/components/shared/DetailHero";
import { DetailRow } from "@/components/shared/DetailRows";
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
import SpoilerNotice from "@/components/shared/SpoilerNotice";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  shop: ServerFacetedValue<ShopDetailViewModel> | null;
  servers: GameServer[];
  neighbors?: DetailNeighbors | undefined;
}

const panelHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--md-ref-typeface-brand)] text-xl text-on-surface sm:text-2xl";

/** One shop pack as the page's server sells it (docs/servers.md). */
export default function ShopDetail({ locale, shop: faceted, servers, neighbors }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const shop = useMemo(() => faceted && moveReleaseUrls(valueForServer(faceted, server), entityServer(faceted, server)), [faceted, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} hideSwitch>
      <ShopDetailView
        locale={locale}
        serverSwitch={serverSwitch}
        shop={shop}
        schedules={faceted && <ServerSchedules locale={locale} faceted={faceted} servers={servers} alwaysLabel={t(locale, "shop.alwaysOpen")} />}
      />
      <EntityPager locale={locale} listRouteId="shop" {...neighbors} className="mt-8" />
    </ServerScope>
  );
}

function ShopDetailView({ locale, shop, serverSwitch, schedules }: { locale: AppLocale; serverSwitch: ReactNode; shop: ShopDetailViewModel | null; schedules: ReactNode }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const { showSpoiler } = useSpoiler();
  const isUnreleased = Boolean(shop?.startAt && isSpoiler(shop.startAt, now));

  if (!shop) return <NotFound locale={locale} />;
  if (!showSpoiler && isUnreleased) return <SpoilerNotice locale={locale} />;

  const schedule = formatScheduleRange(shop.startAt, shop.endAt, locale, timeZone) || t(locale, "shop.alwaysOpen");
  const facts: Array<[string, ReactNode]> = [
    [t(locale, "shop.payment"), t(locale, `shop.payments.${shop.payment.kind}`)],
    [t(locale, "shop.price"), <ShopPrice locale={locale} payment={shop.payment} />],
    [t(locale, "shop.limit"), shopLimitLabel(locale, shop)],
    [t(locale, "shop.period"), <span className="tabular-nums">{schedule}</span>],
  ];
  if (shop.vipRank > 0) {
    facts.push([t(locale, "shop.vipRank"), (
      <a href={localizePath(entityLinkPath({ routeId: "tgw-card", query: { rank: String(shop.vipRank) } }), locale)} className="underline decoration-dotted underline-offset-4 hover:text-primary">
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
      <DetailHero title={shop.name} aside={serverSwitch} eyebrow={<ScheduleBadge locale={locale} startAt={shop.startAt} endAt={shop.endAt} now={now} />}>
        {shop.description && <p className="mt-1 max-w-[60ch] whitespace-pre-line text-body-large text-on-surface-variant">{shop.description}</p>}
      </DetailHero>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          <div className="md3-surface p-4">
            <ShopThumbnail eager className="rounded-shape-md" src={shop.thumbnailUrl} alt={shop.name} fallback={shop.name} />
          </div>
          <div className="md3-surface overflow-hidden">
            <dl className="divide-y divide-outline-variant px-6">
              {facts.map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}
            </dl>
            <TimesNote locale={locale} value={shop.startAt || shop.endAt} timeZone={timeZone} className="px-6 pb-5 text-body-small text-on-surface-variant" />
            <div className="px-6 pb-5 empty:hidden">{schedules}</div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <div className="md3-surface overflow-hidden">
            <div className={panelHeader}><h3 className={panelTitle}>{t(locale, "shop.contents")}</h3></div>
            {shop.products.length === 0 ? (
              <p className="p-6 text-body-medium text-on-surface-variant">{t(locale, "shop.noContents")}</p>
            ) : (
              <ul className="divide-y divide-dashed divide-outline-variant/60 px-4 sm:px-6">
                {[...items, ...bonuses].map((product) => (
                  <li key={product.id} className="flex flex-wrap items-center gap-2 py-3.5">
                    <RewardChip reward={product.reward} locale={locale} />
                    {product.isBonus && (
                      <span className="rounded-full border border-primary/30 bg-secondary-container px-2 py-0.5 text-label-small text-primary">{t(locale, "shop.bonus")}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {prices.length > 0 && (
            <div className="md3-surface overflow-hidden">
              <div className={panelHeader}><h3 className={panelTitle}>{t(locale, "shop.storePrices")}</h3></div>
              <dl className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-6">
                {prices.map((price) => (
                  <div key={price.currency} className="rounded-shape-md border border-outline-variant bg-surface-container p-3">
                    <dt className="text-label-medium text-on-surface-variant">{t(locale, `shop.currencies.${price.currency}`)}</dt>
                    <dd className="mt-1 font-mono text-title-medium tabular-nums text-on-surface">{formatShopPrice(price, locale)}</dd>
                  </div>
                ))}
              </dl>
              <p className="px-6 pb-5 text-body-small leading-6 text-on-surface-variant">{t(locale, "shop.storePricesNote")}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="md3-surface p-8 text-center sm:p-12">
      <h1 className="text-headline-small text-on-surface">{t(locale, "shop.notFoundTitle")}</h1>
      <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "shop.notFoundDescription")}</p>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import BaseFilters, { FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import CollectionViewSwitch, { useCollectionView } from "@/components/shared/CollectionViewSwitch";
import DataTable, { type DataTableColumn } from "@/components/shared/DataTable";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import ServerAvailabilityBadge from "@/components/shared/ServerAvailabilityBadge";
import ShopPrice, { shopLimitLabel } from "@/components/shop/ShopPrice";
import ShopThumbnail from "@/components/shop/ShopThumbnail";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { scheduleStatus, type ScheduleStatus } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerList } from "@/lib/servers/use-content-server";
import type { ShopLimitKind, ShopPaymentKind, ShopSummaryViewModel } from "@/lib/shop/data";
import { shopPath } from "@/lib/shop/links";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  initialShops: ServerFaceted<ShopSummaryViewModel>[];
  servers: GameServer[];
}

const paymentKinds: ShopPaymentKind[] = ["money", "paidStar", "star", "ad", "other"];
const limitKinds: ShopLimitKind[] = ["unlimited", "once", "daily", "weekly", "monthly"];
const statuses: ScheduleStatus[] = ["ongoing", "upcoming", "permanent", "ended"];
const views = ["grid", "table"] as const;

export default function ShopExplorer({ locale, servers, initialShops }: Props) {
  const now = useNow();
  const { server, pickServer, items: shops } = useServerList(locale, servers, initialShops);
  const [view, setView] = useCollectionView("shop", views, "grid");
  const [query, setQuery] = useState("");
  const sort = useListSort("shop", locale, "endingSoon", { numeric: [{ key: "sortPrice", labelKey: "shop.sortPrice", initialDirection: "asc" }] });
  const [selectedPayments, setSelectedPayments] = useState<ShopPaymentKind[]>([]);
  const [selectedLimits, setSelectedLimits] = useState<ShopLimitKind[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<ScheduleStatus[]>([]);

  const { showSpoiler } = useSpoiler();
  const visibleShops = useMemo(() => {
    if (showSpoiler) return shops;
    return shops.filter((shop) => !isSpoiler(shop.startAt, now));
  }, [shops, showSpoiler, now]);

  const availablePayments = useMemo(() => paymentKinds.filter((kind) => visibleShops.some((shop) => shop.payment.kind === kind)), [visibleShops]);
  const availableLimits = useMemo(() => limitKinds.filter((kind) => visibleShops.some((shop) => shop.limitKind === kind)), [visibleShops]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return visibleShops.filter((shop) => {
      if (selectedPayments.length > 0 && !selectedPayments.includes(shop.payment.kind)) return false;
      if (selectedLimits.length > 0 && !selectedLimits.includes(shop.limitKind)) return false;
      if (selectedStatuses.length > 0 && now !== null && !selectedStatuses.includes(scheduleStatus(shop.startAt, shop.endAt, now))) return false;
      return !needle || shop.searchText.includes(needle);
    });
  }, [visibleShops, query, selectedPayments, selectedLimits, selectedStatuses, now]);

  const sorted = useMemo(() => sortEntries(filtered, sort.value, locale, now === null ? {} : { now }), [filtered, sort.value, locale, now]);
  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedPayments.length > 0 || selectedLimits.length > 0 || selectedStatuses.length > 0;

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedPayments([]);
    setSelectedLimits([]);
    setSelectedStatuses([]);
  };

  const quickFilterContent = (
    <BaseFilters
      locale={locale}
      sort={sort}
      variant="plain"
      title={t(locale, "shop.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "shop.searchPlaceholder")}
      resultCount={filtered.length}
      totalCount={shops.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "shop.payment")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedPayments.length === 0} onClick={() => setSelectedPayments([])}>ALL</FilterButton>
          {availablePayments.map((kind) => (
            <FilterButton key={kind} active={selectedPayments.includes(kind)} onClick={() => setSelectedPayments((current) => toggleArrayItem(current, kind))}>
              {t(locale, `shop.payments.${kind}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
      <FilterSection title={t(locale, "shop.limit")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedLimits.length === 0} onClick={() => setSelectedLimits([])}>ALL</FilterButton>
          {availableLimits.map((kind) => (
            <FilterButton key={kind} active={selectedLimits.includes(kind)} onClick={() => setSelectedLimits((current) => toggleArrayItem(current, kind))}>
              {t(locale, `shop.limits.${kind}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
      <FilterSection title={t(locale, "shop.status")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedStatuses.length === 0} onClick={() => setSelectedStatuses([])}>ALL</FilterButton>
          {statuses.map((status) => (
            <FilterButton key={status} active={selectedStatuses.includes(status)} onClick={() => setSelectedStatuses((current) => toggleArrayItem(current, status))}>
              {t(locale, `schedule.${status}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
    </BaseFilters>
  );

  useQuickFilter(t(locale, "shop.filterTitle"), quickFilterContent, [
    sort.value, query, selectedPayments, selectedLimits, selectedStatuses, availablePayments, availableLimits, hasActiveFilters, filtered.length, shops.length, locale,
  ]);

  const columns: DataTableColumn<ServerFaceted<ShopSummaryViewModel>>[] = [
    {
      key: "name",
      header: t(locale, "shop.columns.name"),
      sticky: true,
      render: (shop) => (
        <span className="flex min-w-[14rem] items-center gap-3">
          <ShopThumbnail src={shop.thumbnailUrl} alt="" fallback={shop.name} className="w-20 shrink-0 rounded-shape-sm" />
          <span className="min-w-0">
            <span className="line-clamp-2 font-bold text-on-surface">{shop.name}</span>
            <ServerAvailabilityBadge locale={locale} entity={shop} servers={servers} className="mt-1" />
          </span>
        </span>
      ),
    },
    { key: "price", header: t(locale, "shop.columns.price"), render: (shop) => <ShopPrice locale={locale} payment={shop.payment} compact /> },
    { key: "limit", header: t(locale, "shop.columns.limit"), render: (shop) => <span className="whitespace-nowrap text-label-medium">{shopLimitLabel(locale, shop)}</span> },
    {
      key: "status",
      header: t(locale, "shop.columns.status"),
      render: (shop) => (
        <span className="flex flex-col items-start gap-1">
          <ScheduleBadge locale={locale} startAt={shop.startAt} endAt={shop.endAt} now={now} countdown={false} />
          <ScheduleCountdown locale={locale} startAt={shop.startAt} endAt={shop.endAt} now={now} />
        </span>
      ),
    },
    { key: "id", header: "ID", numeric: true, render: (shop) => <span className="text-body-small text-on-surface-variant">#{shop.id}</span> },
  ];

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <div className="mb-4 flex justify-end">
        <CollectionViewSwitch locale={locale} views={views} value={view} onChange={setView} compact />
      </div>
      <section className="min-w-0" aria-live="polite">
        {shops.length === 0 ? (
          <p className="md3-surface p-8 text-center text-body-medium text-on-surface-variant">{t(locale, "shop.noneOnServer")}</p>
        ) : filtered.length === 0 ? (
          <div className="md3-surface p-8 text-center sm:p-12">
            <h2 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">{t(locale, "shop.emptyTitle")}</h2>
            <button type="button" onClick={resetFilters} className="md3-button md3-button--tonal mt-6">
              {t(locale, "filter.reset")}
            </button>
          </div>
        ) : view === "table" ? (
          <DataTable locale={locale} columns={columns} rows={sorted} rowKey={(shop) => shop.id} rowHref={(shop) => localizePath(shopPath(shop.id), locale)} caption={t(locale, "nav.items.shop")} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 5xl:grid-cols-5">
            {sorted.map((shop) => (
              <li key={shop.id} className="min-w-0">
                <ShopCard shop={shop} locale={locale} now={now} servers={servers} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </ServerScope>
  );
}

function ShopCard({ shop, locale, now, servers }: { shop: ServerFaceted<ShopSummaryViewModel>; locale: AppLocale; now: number | null; servers: GameServer[] }) {
  return (
    <a
      href={localizePath(shopPath(shop.id), locale)}
      className="mn-list-card group flex h-full min-w-0 flex-col overflow-hidden border border-outline-variant bg-surface-container-low shadow-elevation-1 transition hover:shadow-elevation-1"
      data-list-item-id={shop.id}
      aria-label={t(locale, "shop.openDetail", { name: shop.name })}
    >
      <div className="relative border-b border-outline-variant">
        <ShopThumbnail src={shop.thumbnailUrl} alt="" fallback={shop.name} />
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
          <ScheduleBadge locale={locale} startAt={shop.startAt} endAt={shop.endAt} now={now} />
          {shop.recommended && (
            <span className="rounded-full border border-primary/30 bg-primary px-2 py-1 text-label-small text-on-primary">{t(locale, "shop.recommended")}</span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <h3 className="line-clamp-2 text-label-large leading-5 text-on-surface transition-colors group-hover:text-primary">{shop.name}</h3>
        <ShopPrice locale={locale} payment={shop.payment} compact />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-small text-on-surface-variant">
          <span>{shopLimitLabel(locale, shop)}</span>
          {shop.vipRank > 0 && <span>{t(locale, "shop.vipRankShort", { rank: shop.vipRank })}</span>}
          <ScheduleCountdown locale={locale} startAt={shop.startAt} endAt={shop.endAt} now={now} />
          <ServerAvailabilityBadge locale={locale} entity={shop} servers={servers} />
        </div>
        {shop.highlights.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-2.5 border-t border-dashed border-on-surface-variant/40 pt-3">
            {shop.highlights.map((reward, index) => <RewardChip key={`${reward.kind}:${reward.id}:${index}`} reward={reward} locale={locale} variant="icon" linked={false} />)}
          </div>
        )}
      </div>
    </a>
  );
}

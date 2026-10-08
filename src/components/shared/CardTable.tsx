import { useMemo } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import DataTable, { type DataTableColumn } from "@/components/shared/DataTable";
import ServerAvailabilityBadge from "@/components/shared/ServerAvailabilityBadge";
import { listSortOf, tableSortOf } from "@/lib/cards/list-sort";
import type { ListSort } from "@/lib/filter/list-sort";
import { entityLinkPath } from "@/lib/route/entity-link";
import { formatMasterDate } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useAssetUrl } from "@/lib/servers/use-content-server";

/** One row of a card list's table view: a member or a support card. */
export interface CardTableRow {
  id: number;
  title: string;
  /** The characters on the card (one for a member card). */
  characterNames: string;
  bandName: string;
  rarity: number;
  cardType: number;
  performancePower: number;
  technicPower: number;
  visualPower: number;
  totalPower: number;
  skillName: string;
  startAt: string;
  thumbnailUrl: string;
  rarityIconUrl: string;
  typeIconUrl: string;
  servers?: readonly GameServer[];
}

interface Props {
  locale: AppLocale;
  rows: readonly CardTableRow[];
  /** `cards` or `support-cards`: the detail route each row opens. */
  routeId: "cards" | "support-cards";
  servers: readonly GameServer[];
  /** The list's sort: the headers show it and change it, so the table and the other views agree. */
  sort: ListSort;
  onSortChange: (sort: ListSort) => void;
  onOpen?: () => void;
}

/** The card lists' table view (rows already filtered and sorted by the list). */
export default function CardTable({ locale, rows, routeId, servers, sort, onSortChange, onOpen }: Props) {
  const assetUrl = useAssetUrl();
  const timeZone = useDisplayTimeZone();
  const columns = useMemo<DataTableColumn<CardTableRow>[]>(() => {
    const number = (value: number) => value.toLocaleString(locale);
    return [
    {
      key: "title",
      header: t(locale, "cards.table.card"),
      sticky: true,
      sortValue: (row) => row.title,
      render: (row) => (
        <span className="flex min-w-[12rem] items-center gap-2.5">
          <img className="h-10 w-10 shrink-0 rounded-lg border border-[var(--md-sys-color-outline-variant)]/60 bg-[var(--md-sys-color-surface-container-high)] object-cover" src={assetUrl(row.thumbnailUrl)} alt="" loading="lazy" />
          <span className="min-w-0">
            <span className="block max-w-[16rem] truncate font-bold">{row.title}</span>
            <ServerAvailabilityBadge locale={locale} entity={row} servers={servers} />
          </span>
        </span>
      ),
    },
    { key: "character", header: t(locale, "cards.table.character"), render: (row) => <span className="whitespace-nowrap">{row.characterNames}</span> },
    { key: "band", header: t(locale, "cards.band"), render: (row) => <span className="whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">{row.bandName}</span> },
    {
      key: "rarity",
      header: t(locale, "cards.rarity"),
      align: "center",
      initialDirection: "desc",
      sortValue: (row) => row.rarity,
      render: (row) => row.rarityIconUrl ? <img className="mx-auto h-5 w-auto max-w-14 object-contain" src={row.rarityIconUrl} alt={t(locale, `cards.rarities.${row.rarity}`)} /> : t(locale, `cards.rarities.${row.rarity}`),
    },
    {
      key: "attribute",
      header: t(locale, "cards.attribute"),
      align: "center",
      render: (row) => <img className="mx-auto h-5 w-5 object-contain" src={row.typeIconUrl} alt={t(locale, `cards.attributes.${row.cardType}`)} title={t(locale, `cards.attributes.${row.cardType}`)} />,
    },
    { key: "performance", header: t(locale, "cards.parameters.performance"), numeric: true, sortValue: (row) => row.performancePower, render: (row) => number(row.performancePower) },
    { key: "technique", header: t(locale, "cards.parameters.technique"), numeric: true, sortValue: (row) => row.technicPower, render: (row) => number(row.technicPower) },
    { key: "visual", header: t(locale, "cards.parameters.visual"), numeric: true, sortValue: (row) => row.visualPower, render: (row) => number(row.visualPower) },
    { key: "total", header: t(locale, "cards.sort.total"), numeric: true, sortValue: (row) => row.totalPower, render: (row) => <span className="font-bold">{number(row.totalPower)}</span> },
    { key: "skill", header: t(locale, "cards.sort.skill"), initialDirection: "asc", sortValue: (row) => row.skillName, render: (row) => <span className="whitespace-nowrap text-xs">{row.skillName || "—"}</span> },
    {
      key: "startAt",
      header: t(locale, "cards.detailReleasedAt"),
      initialDirection: "desc",
      sortValue: (row) => row.startAt,
      render: (row) => <span className="whitespace-nowrap text-xs tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{row.startAt ? formatMasterDate(row.startAt, locale, false, timeZone) : "—"}</span>,
    },
    ];
  }, [locale, assetUrl, servers, timeZone]);

  return (
    <DataTable
      locale={locale}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      sort={tableSortOf(sort)}
      sortRows={false}
      onSortChange={(next) => onSortChange(listSortOf(next))}
      rowHref={(row) => localizePath(entityLinkPath({ routeId, detailId: row.id }), locale)}
      {...(onOpen ? { onRowClick: () => onOpen() } : {})}
      caption={t(locale, "cards.table.caption")}
      dense
    />
  );
}

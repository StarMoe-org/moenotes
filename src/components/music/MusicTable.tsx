import type { ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import AudioPlayButton from "@/components/shared/AudioPlayButton";
import DataTable, { type DataTableColumn, type DataTableSort } from "@/components/shared/DataTable";
import { getBandSmallIconUrl, getCardTypeIconUrl, type CardType } from "@/lib/cards/assets";
import { parseNumericSort, numericSortValue, type ListSort } from "@/lib/filter/list-sort";
import type { MusicViewModel } from "@/lib/music/data";
import { DIFFICULTY_CHIP_CLASSES, DIFFICULTY_SHORT_LABELS, MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import { formatBpm, formatDuration, formatNumber, type ChartMetrics, type ChartMetricsIndex } from "@/lib/music/metrics";
import { songTrack } from "@/lib/music/tracks";
import { getRoutePathById } from "@/lib/route/registry";
import { formatMasterDay } from "@/lib/schedule";
import { chartMetricsOf } from "@/components/music/MusicFilters";

export function songHref(song: { id: number }, locale: AppLocale): string {
  return localizePath(`${getRoutePathById("music")}/${song.id}`, locale);
}

interface MusicTableProps {
  locale: AppLocale;
  songs: readonly MusicViewModel[];
  metrics: ChartMetricsIndex;
  /** The chart the per-chart figures describe (the difficulty filter's, else Expert). */
  focus: MusicDifficulty;
  titleOf: (song: MusicViewModel) => string;
  assetUrl: (url: string) => string;
  categoryName: (id: number) => string;
  timeZone: string | null;
  /** The list's sort (useListSort), shown and changed by the headers. */
  sort: ListSort;
  onSort: (sort: ListSort) => void;
  onOpen?: () => void;
  empty?: ReactNode;
}

/** Table header keys whose sort is a list sort; the others order the table only by these. */
const HEADER_SORTS: Readonly<Record<string, string>> = {
  title: "name",
  release: "date",
  notes: "field:notes",
  bpm: "field:bpm",
  duration: "field:duration",
  nps: "field:nps",
  category: "field:category",
  ...Object.fromEntries(MUSIC_DIFFICULTIES.map((difficulty) => [`level-${difficulty}`, `field:level-${difficulty}`])),
};

/** The table's header state for a list sort. */
export function tableSortOf(sort: ListSort): DataTableSort | null {
  if (sort === "nameAsc" || sort === "nameDesc") return { key: "title", direction: sort === "nameAsc" ? "asc" : "desc" };
  if (sort === "dateAsc" || sort === "dateDesc") return { key: "release", direction: sort === "dateAsc" ? "asc" : "desc" };
  const numeric = parseNumericSort(sort);
  if (!numeric) return null;
  const key = Object.entries(HEADER_SORTS).find(([, value]) => value === `field:${numeric.key}`)?.[0];
  return key ? { key, direction: numeric.direction } : null;
}

/** The list sort a header click asks for. */
export function listSortOf(sort: DataTableSort | null): ListSort {
  if (!sort) return "default";
  const target = HEADER_SORTS[sort.key];
  if (!target) return "default";
  if (target === "name") return sort.direction === "asc" ? "nameAsc" : "nameDesc";
  if (target === "date") return sort.direction === "asc" ? "dateAsc" : "dateDesc";
  return numericSortValue(target.slice("field:".length), sort.direction);
}

const dash = "—";

/** Every song as a row: title, play, attribute, band, each level, length, BPM, notes, NPS, category, credits, release. */
export default function MusicTable({ locale, songs, metrics, focus, titleOf, assetUrl, categoryName, timeZone, sort, onSort, onOpen, empty }: MusicTableProps) {
  const figures = (song: MusicViewModel): ChartMetrics | null => chartMetricsOf(metrics, song, focus);
  const levelOf = (song: MusicViewModel, difficulty: MusicDifficulty) => song.difficulties.find((entry) => entry.difficulty === difficulty)?.displayLevel ?? null;
  const focusLabel = t(locale, `music.difficultyLevels.${focus}`);
  const columns: DataTableColumn<MusicViewModel>[] = [
    {
      key: "title",
      header: t(locale, "music.table.title"),
      sticky: true,
      sortValue: titleOf,
      render: (song) => (
        <span className="flex min-w-[12rem] max-w-[18rem] items-center gap-2.5">
          <img className="h-9 w-9 shrink-0 rounded-lg border border-[var(--mn-border)] object-cover" src={assetUrl(song.jacketUrl)} alt="" loading="lazy" />
          <span className="truncate font-bold" title={titleOf(song)}>{titleOf(song)}</span>
        </span>
      ),
    },
    {
      key: "play",
      header: <span className="sr-only">{t(locale, "music.table.play")}</span>,
      align: "center",
      width: "3rem",
      render: (song) => {
        const track = songTrack(song, titleOf(song), assetUrl);
        return track ? <AudioPlayButton locale={locale} track={track} size="sm" /> : <span className="text-[var(--mn-text-muted)]">{dash}</span>;
      },
    },
    {
      key: "attribute",
      header: t(locale, "cards.attribute"),
      align: "center",
      render: (song) => <img className="mx-auto h-5 w-5" src={getCardTypeIconUrl(song.musicType as CardType)} alt={t(locale, `cards.attributes.${song.musicType}`)} title={t(locale, `cards.attributes.${song.musicType}`)} />,
    },
    {
      key: "band",
      header: t(locale, "cards.band"),
      render: (song) => song.bandName ? (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {song.bandId > 0 && <img className="h-5 w-auto shrink-0 object-contain" src={assetUrl(getBandSmallIconUrl(song.bandId))} alt="" aria-hidden="true" />}
          <span className="max-w-[9rem] truncate text-xs">{song.bandName}</span>
        </span>
      ) : dash,
    },
    ...MUSIC_DIFFICULTIES.map((difficulty): DataTableColumn<MusicViewModel> => ({
      key: `level-${difficulty}`,
      header: <span className={`inline-block rounded border px-1 ${DIFFICULTY_CHIP_CLASSES[difficulty]}`} title={t(locale, `music.difficultyLevels.${difficulty}`)}>{DIFFICULTY_SHORT_LABELS[difficulty]}</span>,
      numeric: true,
      sortValue: (song) => levelOf(song, difficulty),
      render: (song) => levelOf(song, difficulty) ?? dash,
    })),
    { key: "duration", header: t(locale, "music.table.duration"), numeric: true, sortValue: (song) => figures(song)?.durationMs, render: (song) => formatDuration(figures(song)?.durationMs) },
    { key: "bpm", header: t(locale, "music.table.bpm"), numeric: true, sortValue: (song) => figures(song)?.bpmMax ?? figures(song)?.bpm, render: (song) => formatBpm(figures(song)) },
    {
      key: "notes",
      header: <span title={focusLabel}>{t(locale, "music.table.notes")}</span>,
      numeric: true,
      sortValue: (song) => song.difficulties.find((entry) => entry.difficulty === focus)?.notesCount,
      render: (song) => formatNumber(song.difficulties.find((entry) => entry.difficulty === focus)?.notesCount, locale),
    },
    { key: "nps", header: <span title={focusLabel}>{t(locale, "music.table.nps")}</span>, numeric: true, sortValue: (song) => figures(song)?.nps, render: (song) => formatNumber(figures(song)?.nps, locale, 2) },
    {
      key: "category",
      header: t(locale, "music.table.category"),
      sortValue: (song) => song.categoryIds?.[0],
      initialDirection: "asc",
      render: (song) => <span className="whitespace-nowrap text-xs">{(song.categoryIds ?? []).map(categoryName).join(" / ") || dash}</span>,
    },
    { key: "composer", header: t(locale, "music.composer"), render: (song) => <CreditCell value={song.composer} /> },
    { key: "lyricist", header: t(locale, "music.lyricist"), render: (song) => <CreditCell value={song.lyricist} /> },
    { key: "arranger", header: t(locale, "music.arranger"), render: (song) => <CreditCell value={song.arranger} /> },
    {
      key: "release",
      header: t(locale, "music.releaseDate"),
      initialDirection: "desc",
      sortValue: (song) => song.startAt,
      render: (song) => <span className="whitespace-nowrap text-xs">{song.startAt ? formatMasterDay(song.startAt, locale, timeZone) : dash}</span>,
    },
  ];
  return (
    <DataTable
      locale={locale}
      caption={t(locale, "music.table.caption")}
      columns={columns}
      rows={songs}
      rowKey={(song) => song.id}
      sort={tableSortOf(sort)}
      onSortChange={(next) => onSort(listSortOf(next))}
      sortRows={false}
      rowHref={(song) => songHref(song, locale)}
      {...(onOpen ? { onRowClick: () => onOpen() } : {})}
      maxHeight="75vh"
      dense
      {...(empty !== undefined ? { empty } : {})}
    />
  );
}

function CreditCell({ value }: { value: string }) {
  return <span className="block max-w-[11rem] truncate text-xs text-[var(--mn-text-muted)]" title={value}>{value || dash}</span>;
}

import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import ServerScope from "@/components/shared/ServerScope";
import AudioPlayButton from "@/components/shared/AudioPlayButton";
import DataTable, { type DataTableColumn, type DataTableSort } from "@/components/shared/DataTable";
import { AttributeFilter, BandFilter, FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import { getBandSmallIconUrl, getCardTypeIconUrl, type CardType } from "@/lib/cards/assets";
import type { MusicViewModel } from "@/lib/music/data";
import { DIFFICULTY_CHIP_CLASSES, DIFFICULTY_SHORT_LABELS, MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import { MUSIC_OTHER_BAND, MUSIC_TYPES, hasOtherBandMusic, musicBandOptions } from "@/lib/music/filter";
import { songMetaRows, type SongMetaMode, type SongMetaRow } from "@/lib/music/song-meta";
import { formatBpm, formatDuration, formatNumber, formatPercent, GEKISOU_MISSION_KEYS, isGekisouMission } from "@/lib/music/metrics";
import { useSongTitle } from "@/lib/music/title-preference";
import { songTrack } from "@/lib/music/tracks";
import { useChartMetrics } from "@/lib/music/use-chart-metrics";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerAssetUrl, useServerList } from "@/lib/servers/use-content-server";
import { songHref } from "@/components/music/MusicTable";

interface Props {
  locale: AppLocale;
  servers: GameServer[];
  initialSongs: ServerFaceted<MusicViewModel>[];
}

const MODES: readonly SongMetaMode[] = ["normal", "gekisou"];
const dash = "—";

/** Every chart as a row (song facts built in, figures from music-data.json), with mode, difficulty, band and attribute filters. */
export default function SongMetaTable({ locale, servers, initialSongs }: Props) {
  const { server, pickServer, items: songs } = useServerList(locale, servers, initialSongs);
  const { index: metrics, status } = useChartMetrics();
  const assetUrl = useServerAssetUrl(server);
  const titleOf = useSongTitle();
  const [mode, setMode] = useState<SongMetaMode>("normal");
  const [difficulties, setDifficulties] = useState<MusicDifficulty[]>(["expert"]);
  const [bands, setBands] = useState<number[]>([]);
  const [types, setTypes] = useState<number[]>([]);
  const [sort, setSort] = useState<DataTableSort | null>({ key: "level", direction: "desc" });

  const bandOptions = useMemo(() => musicBandOptions(songs), [songs]);
  const hasOtherBand = useMemo(() => hasOtherBandMusic(songs), [songs]);
  const rows = useMemo(() => songMetaRows(songs, metrics, { difficulties, bands, types }), [songs, metrics, difficulties, bands, types]);

  const levelOf = (row: SongMetaRow) => row.chart.displayLevel;
  const columns: DataTableColumn<SongMetaRow>[] = [
    {
      key: "title",
      header: t(locale, "music.table.title"),
      sticky: true,
      sortValue: (row) => titleOf(row.song),
      render: (row) => (
        <span className="flex min-w-[11rem] max-w-[16rem] items-center gap-2.5">
          <img className="h-9 w-9 shrink-0 rounded-lg border border-[var(--mn-border)] object-cover" src={assetUrl(row.song.jacketUrl)} alt="" loading="lazy" />
          <span className="truncate font-bold" title={titleOf(row.song)}>{titleOf(row.song)}</span>
        </span>
      ),
    },
    {
      key: "play",
      header: <span className="sr-only">{t(locale, "music.table.play")}</span>,
      align: "center",
      render: (row) => {
        const track = songTrack(row.song, titleOf(row.song), assetUrl);
        return track ? <AudioPlayButton locale={locale} track={track} size="sm" /> : dash;
      },
    },
    {
      key: "difficulty",
      header: t(locale, "music.filters.difficulty"),
      sortValue: (row) => MUSIC_DIFFICULTIES.indexOf(row.chart.difficulty),
      render: (row) => <span className={`inline-block rounded border px-1.5 text-[10px] font-black ${DIFFICULTY_CHIP_CLASSES[row.chart.difficulty]}`}>{DIFFICULTY_SHORT_LABELS[row.chart.difficulty]}</span>,
    },
    { key: "level", header: t(locale, "music.chart.level"), numeric: true, sortValue: levelOf, render: levelOf },
    {
      key: "band",
      header: t(locale, "cards.band"),
      sortValue: (row) => row.song.bandName || null,
      render: (row) => row.song.bandName ? (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {row.song.bandId > 0 && <img className="h-5 w-auto shrink-0 object-contain" src={assetUrl(getBandSmallIconUrl(row.song.bandId))} alt="" aria-hidden="true" />}
          <span className="max-w-[8rem] truncate text-xs">{row.song.bandName}</span>
        </span>
      ) : dash,
    },
    {
      key: "attribute",
      header: t(locale, "cards.attribute"),
      align: "center",
      sortValue: (row) => row.song.musicType,
      initialDirection: "asc",
      render: (row) => <img className="mx-auto h-5 w-5" src={getCardTypeIconUrl(row.song.musicType as CardType)} alt={t(locale, `cards.attributes.${row.song.musicType}`)} title={t(locale, `cards.attributes.${row.song.musicType}`)} />,
    },
    { key: "duration", header: t(locale, "music.table.duration"), numeric: true, sortValue: (row) => row.metrics?.durationMs, render: (row) => formatDuration(row.metrics?.durationMs) },
    { key: "bpm", header: t(locale, "music.table.bpm"), numeric: true, sortValue: (row) => row.metrics?.bpmMax ?? row.metrics?.bpm, render: (row) => formatBpm(row.metrics) },
    { key: "notes", header: t(locale, "music.table.notes"), numeric: true, sortValue: (row) => row.notes, render: (row) => formatNumber(row.notes, locale) },
    { key: "nps", header: t(locale, "music.table.nps"), numeric: true, sortValue: (row) => row.metrics?.nps, render: (row) => formatNumber(row.metrics?.nps, locale, 2) },
    { key: "coverage", header: t(locale, "music.chart.skillCoverage"), numeric: true, sortValue: (row) => row.metrics?.skillCoverage, render: (row) => formatPercent(row.metrics?.skillCoverage, locale) },
    { key: "rate", header: t(locale, "music.chart.rate"), numeric: true, sortValue: (row) => row.metrics?.rate, render: (row) => formatNumber(row.metrics?.rate, locale, 2) },
    { key: "perMinute", header: t(locale, "music.chart.perMinute"), numeric: true, sortValue: (row) => row.metrics?.perMinute, render: (row) => formatNumber(row.metrics?.perMinute, locale, 2) },
    ...(mode === "gekisou" ? [
      {
        key: "missions",
        header: t(locale, "music.gekisou.title"),
        render: (row: SongMetaRow) => {
          const missions = row.missions.filter(isGekisouMission);
          return missions.length ? <span className="whitespace-nowrap text-xs">{missions.map((mission) => t(locale, `music.gekisou.missions.${GEKISOU_MISSION_KEYS[mission]}`)).join(" / ")}</span> : dash;
        },
      },
      { key: "justRate", header: t(locale, "music.meta.justRate"), numeric: true, sortValue: (row: SongMetaRow) => row.metrics?.justRate, render: (row: SongMetaRow) => formatPercent(row.metrics?.justRate, locale) },
      { key: "justNotes", header: t(locale, "music.meta.justNotes"), numeric: true, sortValue: (row: SongMetaRow) => row.metrics?.justNotes, render: (row: SongMetaRow) => formatNumber(row.metrics?.justNotes, locale) },
      { key: "luck", header: t(locale, "music.meta.luck"), numeric: true, sortValue: (row: SongMetaRow) => row.metrics?.luckPoints, render: (row: SongMetaRow) => formatNumber(row.metrics?.luckPoints, locale, 1) },
    ] satisfies DataTableColumn<SongMetaRow>[] : []),
  ];

  const segmented = "mn-segmented flex w-fit gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1";
  const segment = (active: boolean) => `mn-focus rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? "bg-[var(--mn-accent-soft)] text-[var(--mn-text)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`;

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <div className="space-y-4">
        <div className="mn-paper space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className={segmented} role="group" aria-label={t(locale, "music.meta.mode")}>
              {MODES.map((entry) => (
                <button key={entry} type="button" aria-pressed={mode === entry} onClick={() => setMode(entry)} className={segment(mode === entry)}>
                  {t(locale, `music.meta.modes.${entry}`)}
                </button>
              ))}
            </div>
            <span className="text-xs font-semibold text-[var(--mn-text-muted)]">{t(locale, "music.meta.count", { count: rows.length })}</span>
          </div>
          <FilterSection title={t(locale, "music.filters.difficulty")}>
            <div className="flex flex-wrap gap-2">
              <FilterButton active={difficulties.length === 0} onClick={() => setDifficulties([])}>ALL</FilterButton>
              {MUSIC_DIFFICULTIES.map((difficulty) => (
                <FilterButton key={difficulty} active={difficulties.includes(difficulty)} onClick={() => setDifficulties((current) => toggleArrayItem(current, difficulty))}>
                  {t(locale, `music.difficultyLevels.${difficulty}`)}
                </FilterButton>
              ))}
            </div>
          </FilterSection>
          <div className="grid gap-4 lg:grid-cols-2">
            <BandFilter
              title={t(locale, "cards.band")}
              bands={bandOptions}
              selectedBands={bands}
              onChange={setBands}
              getIconUrl={(id) => assetUrl(getBandSmallIconUrl(id))}
              extraOption={hasOtherBand ? { id: MUSIC_OTHER_BAND, label: t(locale, "music.filters.bandOther") } : undefined}
            />
            <AttributeFilter
              title={t(locale, "cards.attribute")}
              attributes={MUSIC_TYPES}
              selectedAttributes={types}
              onChange={setTypes}
              getAttributeLabel={(value) => t(locale, `cards.attributes.${value}`)}
            />
          </div>
          <p className="text-[11px] leading-5 text-[var(--mn-text-muted)]">
            {status === "loading" ? t(locale, "music.meta.loading") : status === "error" ? t(locale, "music.chart.unavailable") : t(locale, `music.meta.hints.${mode}`)}
          </p>
        </div>

        <DataTable
          locale={locale}
          caption={t(locale, "seo.songMeta.title")}
          columns={columns}
          rows={rows}
          rowKey={(row) => `${row.song.id}:${row.chart.difficulty}`}
          sort={sort}
          onSortChange={setSort}
          rowHref={(row) => songHref(row.song, locale)}
          maxHeight="78vh"
          dense
          empty={(
            <div className="mn-paper p-8 text-center">
              <p className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)]">{t(locale, "music.emptyTitle")}</p>
              <p className="mt-2 text-sm text-[var(--mn-text-muted)]">{t(locale, "music.emptyDescription")}</p>
            </div>
          )}
        />
      </div>
    </ServerScope>
  );
}

import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import AudioPlayButton from "@/components/shared/AudioPlayButton";
import CharacterAvatarStack from "@/components/shared/CharacterAvatarStack";
import CollectionViewSwitch from "@/components/shared/CollectionViewSwitch";
import DataTable, { type DataTableColumn } from "@/components/shared/DataTable";
import DetailOverlay from "@/components/shared/DetailOverlay";
import EntityPager from "@/components/shared/EntityPager";
import Lightbox, { type LightboxImage } from "@/components/shared/Lightbox";
import LevelSwitch from "@/components/shared/LevelSwitch";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import ServerAvailabilityBadge from "@/components/shared/ServerAvailabilityBadge";
import SortControl from "@/components/shared/SortControl";
import UpgradeCostTable, { type UpgradeStep } from "@/components/shared/UpgradeCostTable";
import { DateRangeFilter } from "@/components/shared/filters/DateRangeFilter";
import type { AudioTrack } from "@/lib/audio/player";
import { useCollectionView } from "@/lib/collection/use-collection-view";
import { inDateRange, type DateRange } from "@/lib/filter/date-range";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import { getMusicAudioUrl, getMusicJacketUrl } from "@/lib/music/data";
import { parsePositiveIntParam, useQueryOverlay } from "@/lib/overlay/use-query-overlay";
import { detailNeighbors } from "@/lib/route/detail-neighbors";
import { entityLinkPath } from "@/lib/route/entity-link";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import { useNow } from "@/lib/schedule/use-now";

const DAY = 86_400_000;

/** A MasterData-style timestamp (UTC+8 wall time) `days` from `now`. */
function masterTime(now: number, days: number): string {
  const date = new Date(now + days * DAY + 8 * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:00:00`;
}

interface SampleRow {
  id: number;
  name: string;
  level: number;
  power: number;
  bpm: number;
  startAt: string;
  endAt: string;
}

function Demo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 border-b border-[var(--mn-border)] pb-8 last:border-0 last:pb-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">{title}</h3>
      {children}
    </div>
  );
}

/** Wave 1 shared components, each with sample data. */
export default function FoundationSection({ locale }: { locale: AppLocale }) {
  const f = (key: string, values?: Record<string, string | number>) => t(locale, `designSystem.foundation.${key}`, values);
  const now = useNow();
  const base = now ?? 0;
  const assetUrl = useAssetUrl();

  const rows = useMemo<SampleRow[]>(() => [1, 2, 3, 4, 5, 6].map((n) => ({
    id: n,
    name: f("sampleItem", { n }),
    level: [60, 50, 70, 40, 80, 55][n - 1]!,
    power: [31250, 28800, 35120, 21400, 40210, 30010][n - 1]!,
    bpm: [180, 150, 200, 128, 222, 165][n - 1]!,
    startAt: masterTime(base, [-20, -3, 4, -40, 12, -1][n - 1]!),
    endAt: masterTime(base, [-10, 2, 14, -30, 25, 9][n - 1]!),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [base, locale]);

  // 1 view switch (synced to ?view=)
  const [view, setView] = useCollectionView("design-system", ["grid", "list", "table"] as const, "grid");

  // 2/3 table + list sort (endingSoon + numeric fields)
  const sort = useListSort("design-system", locale, "date endingSoon", { numeric: [{ key: "bpm", labelKey: "designSystem.foundation.sampleBpm" }, { key: "power", labelKey: "designSystem.foundation.samplePower" }] });

  // 4 date range
  const [range, setRange] = useState<DateRange>({});
  const inRange = rows.filter((row) => inDateRange(row, range));
  const sorted = sortEntries(inRange, sort.value, locale, { now: base });

  const columns: DataTableColumn<SampleRow>[] = [
    { key: "name", header: f("sampleName"), sticky: true, sortValue: (row) => row.name, render: (row) => <span className="font-bold">{row.name}</span> },
    { key: "level", header: f("sampleLevel"), numeric: true, sortValue: (row) => row.level },
    { key: "power", header: f("samplePower"), numeric: true, sortValue: (row) => row.power, render: (row) => row.power.toLocaleString(locale) },
    { key: "bpm", header: f("sampleBpm"), numeric: true, sortValue: (row) => row.bpm },
    { key: "schedule", header: f("countdown"), render: (row) => <ScheduleCountdown locale={locale} startAt={row.startAt} endAt={row.endAt} now={now} /> },
  ];

  // 7 servers
  const buildServers: GameServer[] = ["jp", "tw", "kr", "en"];

  // 8 lightbox
  const images: LightboxImage[] = [1, 2, 3].map((n) => ({
    src: assetUrl(getMusicJacketUrl(["jkt_004_100069", "jkt_001_100001", "jkt_002_100011"][n - 1]!)),
    alt: f("sampleItem", { n }),
    caption: f("sampleCaption", { n }),
    downloadName: `sample-${n}.webp`,
  }));
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // 9 upgrade costs
  const steps: UpgradeStep[] = [1, 2, 3].map((to) => ({
    from: to - 1,
    to,
    costs: [
      { id: "coin", name: f("sampleItem", { n: 1 }), imageUrl: "", count: to * 1000 },
      ...(to > 1 ? [{ id: "gem", name: f("sampleItem", { n: 2 }), imageUrl: "", count: to * 5 }] : []),
    ],
  }));

  // 10 level switch
  const [skillLevel, setSkillLevel] = useState(1);
  const [level, setLevel] = useState(50);

  // 11 audio
  const tracks: AudioTrack[] = [1, 2].map((n) => ({
    id: `demo-${n}`,
    src: assetUrl(getMusicAudioUrl({ id: n, cueSheetName: "A_Abracadabra", cueName: "A_Abracadabra" }, locale)),
    title: f("sampleTrack", { n }),
  }));
  const brokenTrack: AudioTrack = { id: "demo-broken", src: "data:audio/mp4;base64,AAAA", title: f("sampleTrack", { n: 3 }) };

  // 13 pager
  const neighbors = detailNeighbors(rows, (row) => row.id, (row) => row.name, (row) => entityLinkPath({ routeId: "cards", detailId: row.id }));

  // 14 overlay (?demo=<id>)
  const overlay = useQueryOverlay("demo", { parse: parsePositiveIntParam });
  const overlayRow = rows.find((row) => row.id === overlay.value) ?? null;

  return (
    <div className="space-y-8">
      <p className="text-sm text-[var(--mn-text-muted)]">{f("hint")}</p>
      <Demo title={f("collectionView")}>
        <CollectionViewSwitch locale={locale} views={["grid", "list", "table"] as const} value={view} onChange={setView} />
        {view === "table" ? (
          <DataTable locale={locale} columns={columns} rows={sorted} rowKey={(row) => row.id} caption={f("dataTable")} empty={<p className="text-sm text-[var(--mn-text-muted)]">{f("sampleEmpty")}</p>} />
        ) : (
          <div className={view === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "space-y-2"}>
            {sorted.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-3 shadow-[var(--mn-shadow-stamp-sm)]">
                <span className="text-sm font-bold text-[var(--mn-text)]">{row.name}</span>
                <ScheduleCountdown locale={locale} startAt={row.startAt} endAt={row.endAt} now={now} />
              </div>
            ))}
          </div>
        )}
      </Demo>

      <Demo title={`${f("dataTable")} / ${f("sortExtensions")} / ${f("dateRange")}`}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
          <SortControl {...sort} />
          <DateRangeFilter title={t(locale, "filter.dateRange")} value={range} onChange={setRange} fromLabel={t(locale, "filter.dateFrom")} toLabel={t(locale, "filter.dateTo")} clearLabel={t(locale, "filter.dateClear")} />
        </div>
        <p className="text-xs font-semibold text-[var(--mn-text-muted)]">{f("sampleCount", { count: inRange.length, total: rows.length })}</p>
        <DataTable
          locale={locale}
          columns={columns}
          rows={sorted}
          rowKey={(row) => row.id}
          rowHref={(row) => entityLinkPath({ routeId: "cards", detailId: row.id })}
          maxHeight="18rem"
          empty={<p className="rounded-2xl border border-dashed border-[var(--mn-border)] p-6 text-center text-sm text-[var(--mn-text-muted)]">{f("sampleEmpty")}</p>}
        />
      </Demo>

      <Demo title={`${f("avatarStack")} / ${f("serverBadge")}`}>
        <div className="flex flex-wrap items-center gap-6">
          <CharacterAvatarStack locale={locale} characters={[1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, name: f("sampleItem", { n: id }) }))} max={5} />
          <CharacterAvatarStack locale={locale} characters={[11, 12, 13].map((id) => ({ id, name: f("sampleItem", { n: id }) }))} size="sm" showNames />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--mn-text-muted)]">
          <span>{f("someServers")}</span>
          <ServerAvailabilityBadge locale={locale} entity={{ servers: ["jp"] }} servers={buildServers} />
          <ServerAvailabilityBadge locale={locale} entity={{ servers: ["jp", "tw"] }} servers={buildServers} showLabel />
          <span>{f("allServers")}</span>
          <ServerAvailabilityBadge locale={locale} entity={{ servers: buildServers }} servers={buildServers} />
        </div>
      </Demo>

      <Demo title={f("lightbox")}>
        <div className="flex flex-wrap gap-3">
          {images.map((image, index) => (
            <button key={image.src} type="button" onClick={() => { setLightboxIndex(index); setLightboxOpen(true); }} className="mn-focus overflow-hidden rounded-xl border border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp-sm)]" aria-label={`${f("openLightbox")}: ${image.alt}`}>
              <img src={image.src} alt="" loading="lazy" className="h-24 w-24 bg-[var(--mn-cream-deep)] object-cover" />
            </button>
          ))}
        </div>
        <Lightbox locale={locale} images={images} index={lightboxIndex} open={lightboxOpen} onClose={() => setLightboxOpen(false)} onIndexChange={setLightboxIndex} />
      </Demo>

      <Demo title={`${f("upgradeCost")} / ${f("levelSwitch")}`}>
        <div className="grid gap-6 md:grid-cols-2">
          <UpgradeCostTable locale={locale} steps={steps} cumulative formatStep={(step) => `Lv.${step.from} → Lv.${step.to}`} />
          <div className="space-y-4">
            <LevelSwitch label={f("skillLevel")} value={skillLevel} options={[1, 2, 3, 4, 5]} onChange={setSkillLevel} />
            <LevelSwitch variant="slider" label={f("level")} value={level} options={[1, 10, 20, 30, 40, 50, 60, 70, 80]} formatValue={(value) => `Lv.${value}`} onChange={setLevel} decreaseLabel={f("decrease")} increaseLabel={f("increase")} maxLabel={f("max")} />
          </div>
        </div>
      </Demo>

      <Demo title={f("audioButton")}>
        <div className="flex flex-wrap items-center gap-3">
          {tracks.map((track) => <AudioPlayButton key={track.id} locale={locale} track={track} />)}
          <AudioPlayButton locale={locale} track={tracks[0]!} showLabel />
          <AudioPlayButton locale={locale} track={brokenTrack} size="sm" />
        </div>
      </Demo>

      <Demo title={f("entityPager")}>
        <EntityPager locale={locale} listRouteId="cards" {...neighbors.get(3)} />
        <EntityPager locale={locale} listRouteId="cards" {...neighbors.get(1)} />
      </Demo>

      <Demo title={f("detailOverlay")}>
        <div className="flex flex-wrap gap-2">
          {rows.slice(0, 3).map((row) => (
            <button key={row.id} type="button" onClick={() => overlay.open(row.id)} aria-haspopup="dialog" className="mn-focus mn-stamp-press rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-2 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)]">
              {f("openOverlay")}: {row.name}
            </button>
          ))}
        </div>
        <DetailOverlay locale={locale} open={overlayRow !== null} onClose={overlay.close} title={overlayRow?.name}>
          <p className="text-sm leading-7 text-[var(--mn-text-muted)]">{f("overlayBody")}</p>
          {overlayRow ? <ScheduleCountdown locale={locale} startAt={overlayRow.startAt} endAt={overlayRow.endAt} now={now} showPermanent /> : null}
        </DetailOverlay>
      </Demo>
    </div>
  );
}

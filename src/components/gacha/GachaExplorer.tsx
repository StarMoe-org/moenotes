import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useAssetUrl, useServerList } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BaseFilters, { BandFilter, FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import BannerImage from "@/components/shared/BannerImage";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import LimitedChip from "@/components/gacha/LimitedChip";
import { getImageAssetUrl } from "@/lib/assets/url";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import type { GachaCategory, GachaPickupCharacter, GachaViewModel } from "@/lib/gacha/data";
import { getRoutePathById } from "@/lib/route/registry";
import { formatScheduleRange, scheduleStatus, type ScheduleStatus } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";

interface Props {
  locale: AppLocale;
  initialGachas: ServerFaceted<GachaViewModel>[];
  servers: GameServer[];
  bands: Array<[number, string]>;
}

const statuses: ScheduleStatus[] = ["ongoing", "upcoming", "permanent", "ended"];
const categories: GachaCategory[] = ["stars", "ticket", "ad", "pass", "bonus", "other"];

export default function GachaExplorer({ locale, servers, initialGachas, bands }: Props) {
  const memory = useListPageMemory("gacha");
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const { server, pickServer, items: gachas } = useServerList(locale, servers, initialGachas);
  const [query, setQuery] = useState("");
  // Most pools have no start date, so the date ordering is left out; "ending soon" reads the end dates they do have.
  const sort = useListSort("gacha", locale, "endingSoon");
  const [selectedStatuses, setSelectedStatuses] = useState<ScheduleStatus[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<GachaCategory[]>([]);
  const [selectedBands, setSelectedBands] = useState<number[]>([]);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
    setSelectedStatuses(remembered.statuses);
    setSelectedBands(remembered.bands);
    setSelectedCategories(remembered.categories);
  }, [memory.state?.filtersHash]);

  useEffect(() => {
    if (!memory.state?.scrollY) return;
    const targetY = memory.state.scrollY;
    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY });
    });
    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [memory.state?.scrollY]);

  const saveCurrentState = useCallback(() => {
    const filtersHash = JSON.stringify({ query, statuses: selectedStatuses, bands: selectedBands, categories: selectedCategories });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedStatuses, selectedBands, selectedCategories, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const pickupBands = useMemo(() => {
    const used = new Set(gachas.flatMap((gacha) => gacha.bandIds));
    return bands.filter(([id]) => used.has(id));
  }, [gachas, bands]);
  const availableCategories = useMemo(() => categories.filter((category) => gachas.some((gacha) => gacha.category === category)), [gachas]);

  const filteredGachas = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return gachas.filter((gacha) => {
      // Status depends on the visitor's clock, so it only filters once that is known.
      if (selectedStatuses.length > 0 && now !== null && !selectedStatuses.includes(scheduleStatus(gacha.startAt, gacha.endAt, now))) return false;
      if (selectedBands.length > 0 && !gacha.bandIds.some((id) => selectedBands.includes(id))) return false;
      if (selectedCategories.length > 0 && !selectedCategories.includes(gacha.category)) return false;
      return !needle || gacha.searchText.includes(needle);
    });
  }, [gachas, query, selectedStatuses, selectedBands, selectedCategories, now]);

  const sortedGachas = useMemo(() => sortEntries(filteredGachas, sort.value, locale, now === null ? {} : { now }), [filteredGachas, sort.value, locale, now]);

  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedStatuses.length > 0 || selectedBands.length > 0 || selectedCategories.length > 0;

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedStatuses([]);
    setSelectedBands([]);
    setSelectedCategories([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "gacha.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "gacha.searchPlaceholder")}
      resultCount={filteredGachas.length}
      totalCount={gachas.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "gacha.status")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedStatuses.length === 0} onClick={() => setSelectedStatuses([])}>ALL</FilterButton>
          {statuses.map((status) => (
            <FilterButton key={status} active={selectedStatuses.includes(status)} onClick={() => setSelectedStatuses((current) => toggleArrayItem(current, status))}>
              {t(locale, `schedule.${status}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>

      {availableCategories.length > 1 && (
        <FilterSection title={t(locale, "gacha.category")}>
          <div className="flex flex-wrap gap-2">
            <FilterButton active={selectedCategories.length === 0} onClick={() => setSelectedCategories([])}>ALL</FilterButton>
            {availableCategories.map((category) => (
              <FilterButton key={category} active={selectedCategories.includes(category)} onClick={() => setSelectedCategories((current) => toggleArrayItem(current, category))}>
                {t(locale, `gacha.categories.${category}`)}
              </FilterButton>
            ))}
          </div>
        </FilterSection>
      )}

      {pickupBands.length > 0 && (
        <BandFilter
          title={t(locale, "gacha.pickupBand")}
          bands={pickupBands}
          selectedBands={selectedBands}
          onChange={setSelectedBands}
        />
      )}
    </BaseFilters>
  );

  useQuickFilter(t(locale, "gacha.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedStatuses,
    selectedBands,
    selectedCategories,
    availableCategories,
    pickupBands,
    hasActiveFilters,
    filteredGachas.length,
    gachas.length,
    locale,
  ]);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <section className="min-w-0" aria-live="polite">
        {filteredGachas.length === 0 ? (
          <EmptyState locale={locale} onReset={resetFilters} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 5xl:grid-cols-5">
            {sortedGachas.map((gacha) => (
              <GachaCard key={gacha.id} gacha={gacha} locale={locale} now={now} timeZone={timeZone} onClick={saveCurrentState} />
            ))}
          </div>
        )}
      </section>
    </ServerScope>
  );
}

function GachaCard({ gacha, locale, now, timeZone, onClick }: { gacha: GachaViewModel; locale: AppLocale; now: number | null; timeZone: string | null; onClick: () => void }) {
  const schedule = formatScheduleRange(gacha.startAt, gacha.endAt, locale, timeZone) || t(locale, "gacha.alwaysOpen");
  const counts = [
    gacha.memberCount > 0 && t(locale, "gacha.counts.member", { count: gacha.memberCount }),
    gacha.supportCount > 0 && t(locale, "gacha.counts.support", { count: gacha.supportCount }),
    gacha.itemCount > 0 && t(locale, "gacha.counts.item", { count: gacha.itemCount }),
  ].filter(Boolean).join(" · ");

  return (
    <a
      href={localizePath(`${getRoutePathById("gacha")}/${gacha.id}`, locale)}
      onClick={onClick}
      className="mn-list-card group flex min-w-0 flex-col overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      data-list-item-id={gacha.id}
      aria-label={t(locale, "gacha.openDetail", { name: gacha.name })}
    >
      <div className="relative border-b border-[var(--mn-glass-border)]">
        <BannerImage src={getImageAssetUrl(gacha.bannerPath, locale)} alt="" fallback={gacha.name} />
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
          <ScheduleBadge locale={locale} startAt={gacha.startAt} endAt={gacha.endAt} now={now} />
          {gacha.isLimited && <LimitedChip locale={locale} />}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)] transition-colors group-hover:text-[var(--mn-accent-deep)]">{gacha.name}</h3>
          <p className="mt-1 truncate text-xs font-medium tabular-nums text-[var(--mn-text-muted)]">{schedule}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 truncate text-xs font-medium text-[var(--mn-text-muted)]">
            <span>{t(locale, `gacha.categories.${gacha.category}`)}</span>
            {counts && <span>· {counts}</span>}
            <ScheduleCountdown locale={locale} startAt={gacha.startAt} endAt={gacha.endAt} now={now} />
          </p>
        </div>
        {gacha.pickupCharacters.length > 0 && (
          <div className="mt-auto border-t border-dashed border-[var(--mn-text-muted)]/40 pt-2">
            <PickupFaces characters={gacha.pickupCharacters} label={t(locale, "gacha.pickup")} />
          </div>
        )}
      </div>
    </a>
  );
}

function PickupFaces({ characters, label }: { characters: GachaPickupCharacter[]; label: string }) {
  const assetUrl = useAssetUrl();
  const shown = characters.slice(0, 8);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[10px] font-black tracking-wider text-[var(--mn-accent-deep)]">{label}</span>
      <span className="flex items-center" title={characters.map((character) => character.name).join(" / ")}>
        {shown.map((character) => (
          <img
            key={character.id}
            className="-ml-1.5 h-7 w-7 rounded-full border-2 border-[var(--mn-paper)] bg-[var(--mn-cream-deep)] object-cover first:ml-0"
            src={assetUrl(getCharacterFaceIconUrl(character.id))}
            alt={character.name}
            loading="lazy"
          />
        ))}
        {characters.length > shown.length && <span className="ml-1 text-[11px] font-bold text-[var(--mn-text-muted)]">+{characters.length - shown.length}</span>}
      </span>
    </span>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "gacha.emptyTitle")}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "gacha.emptyDescription")}</p>
      <button type="button" onClick={onReset} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "gacha.reset")}
      </button>
    </div>
  );
}

function parseRememberedFilters(raw?: string) {
  const fallback = { query: "", statuses: [] as ScheduleStatus[], bands: [] as number[], categories: [] as GachaCategory[] };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      statuses: Array.isArray(parsed.statuses) ? parsed.statuses.filter((status) => statuses.includes(status)) : [],
      bands: Array.isArray(parsed.bands) ? parsed.bands : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories.filter((category) => categories.includes(category)) : [],
    };
  } catch {
    return fallback;
  }
}

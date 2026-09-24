import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BaseFilters, { FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import BannerImage from "@/components/shared/BannerImage";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import type { RewardEntryKind, RewardEntrySummary } from "@/lib/rewards/data";
import { getRoutePathById } from "@/lib/route/registry";
import { formatScheduleRange, scheduleStatus, type ScheduleStatus } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";

interface Props {
  locale: AppLocale;
  initialEntries: RewardEntrySummary[];
}

const kinds: RewardEntryKind[] = ["seasonPass", "mission", "loginBonus"];
const statuses: ScheduleStatus[] = ["ongoing", "upcoming", "permanent", "ended"];

export function rewardBannerCrop(kind: RewardEntryKind): string {
  // Login bonus art is a full-screen sheet with its title near the top.
  return kind === "loginBonus" ? "object-top" : "";
}

export default function RewardsExplorer({ locale, initialEntries }: Props) {
  const memory = useListPageMemory("rewards");
  const now = useNow();
  const [entries] = useState(initialEntries);
  const [query, setQuery] = useState("");
  const sort = useListSort("rewards", locale, "date");
  const [selectedKinds, setSelectedKinds] = useState<RewardEntryKind[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<ScheduleStatus[]>([]);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
    setSelectedKinds(remembered.kinds);
    setSelectedStatuses(remembered.statuses);
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
    const filtersHash = JSON.stringify({ query, kinds: selectedKinds, statuses: selectedStatuses });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedKinds, selectedStatuses, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      if (selectedKinds.length > 0 && !selectedKinds.includes(entry.kind)) return false;
      if (selectedStatuses.length > 0 && now !== null && !selectedStatuses.includes(scheduleStatus(entry.startAt, entry.endAt, now))) return false;
      return !needle || entry.searchText.includes(needle);
    });
  }, [entries, query, selectedKinds, selectedStatuses, now]);

  const sortedEntries = useMemo(() => sortEntries(filteredEntries, sort.value, locale), [filteredEntries, sort.value, locale]);

  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedKinds.length > 0 || selectedStatuses.length > 0;

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedKinds([]);
    setSelectedStatuses([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "rewards.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "rewards.searchPlaceholder")}
      resultCount={filteredEntries.length}
      totalCount={entries.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "rewards.kind")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedKinds.length === 0} onClick={() => setSelectedKinds([])}>ALL</FilterButton>
          {kinds.map((kind) => (
            <FilterButton key={kind} active={selectedKinds.includes(kind)} onClick={() => setSelectedKinds((current) => toggleArrayItem(current, kind))}>
              {t(locale, `rewards.kinds.${kind}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
      <FilterSection title={t(locale, "rewards.status")}>
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

  useQuickFilter(t(locale, "rewards.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedKinds,
    selectedStatuses,
    hasActiveFilters,
    filteredEntries.length,
    entries.length,
    locale,
  ]);

  return (
    <section className="min-w-0" aria-live="polite">
      {filteredEntries.length === 0 ? (
        <div className="mn-paper p-8 text-center sm:p-12">
          <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "rewards.emptyTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "rewards.emptyDescription")}</p>
          <button type="button" onClick={resetFilters} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
            {t(locale, "rewards.reset")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 5xl:grid-cols-5">
          {sortedEntries.map((entry) => <RewardEntryCard key={entry.slug} entry={entry} locale={locale} now={now} onClick={saveCurrentState} />)}
        </div>
      )}
    </section>
  );
}

function RewardEntryCard({ entry, locale, now, onClick }: { entry: RewardEntrySummary; locale: AppLocale; now: number | null; onClick: () => void }) {
  const schedule = formatScheduleRange(entry.startAt, entry.endAt, locale) || t(locale, "rewards.alwaysOpen");
  return (
    <a
      href={localizePath(`${getRoutePathById("rewards")}/${entry.slug}`, locale)}
      onClick={onClick}
      className="mn-list-card group flex min-w-0 flex-col overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      data-list-item-id={entry.slug}
      aria-label={t(locale, "rewards.openDetail", { title: entry.title })}
    >
      <div className="relative border-b border-[var(--mn-glass-border)]">
        <BannerImage src={entry.bannerUrl} alt="" fallback={entry.title} imageClassName={rewardBannerCrop(entry.kind)} />
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] px-2.5 py-1 text-[11px] font-bold leading-none text-[var(--mn-ink-soft)]">{t(locale, `rewards.kinds.${entry.kind}`)}</span>
          <ScheduleBadge locale={locale} startAt={entry.startAt} endAt={entry.endAt} now={now} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)] transition-colors group-hover:text-[var(--mn-accent-deep)]">{entry.title}</h3>
          <p className="mt-1 truncate text-xs font-medium tabular-nums text-[var(--mn-text-muted)]">{schedule}</p>
        </div>
        {entry.highlights.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-2.5 border-t border-dashed border-[var(--mn-text-muted)]/40 pt-3">
            {entry.highlights.map((reward) => <RewardChip key={`${reward.kind}:${reward.id}`} reward={reward} locale={locale} variant="icon" linked={false} />)}
          </div>
        )}
      </div>
    </a>
  );
}

function parseRememberedFilters(raw?: string) {
  const fallback = { query: "", kinds: [] as RewardEntryKind[], statuses: [] as ScheduleStatus[] };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      kinds: Array.isArray(parsed.kinds) ? parsed.kinds.filter((kind) => kinds.includes(kind)) : [],
      statuses: Array.isArray(parsed.statuses) ? parsed.statuses.filter((status) => statuses.includes(status)) : [],
    };
  } catch {
    return fallback;
  }
}

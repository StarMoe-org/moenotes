"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BaseFilters, {
  BandFilter,
  FilterButton,
  FilterSection,
  FilterToggle,
  toggleArrayItem,
} from "@/components/shared/BaseFilters";
import ServerScope from "@/components/shared/ServerScope";
import UpgradeCostTable, { type UpgradeStep } from "@/components/shared/UpgradeCostTable";
import { Icon } from "@/components/shared/icons";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getCardThumbnailUrl, getCardTypeIconUrl, type CardType } from "@/lib/cards/assets";
import type { CardViewModel } from "@/lib/cards/data";
import type { CardMaterialStep } from "@/lib/cards/materials";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort, type NumericSortField } from "@/lib/filter/use-list-sort";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { entityLinkPath } from "@/lib/route/entity-link";
import { getRoutePathById } from "@/lib/route/registry";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";
import { compareByStartDesc } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerAssetUrl, useServerList } from "@/lib/servers/use-content-server";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";
import {
  SKILL_FAMILIES,
  type SkillDictionaryEntry,
  type SkillDictionaryViewModel,
  type SkillFamily,
} from "@/lib/skills/dictionary";
import { getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";

interface Props {
  locale: AppLocale;
  servers: GameServer[];
  initialCards: ServerFaceted<CardViewModel>[];
  bands: Array<[number, string]>;
  skillDictionaries: Partial<Record<GameServer, SkillDictionaryViewModel>>;
}

type LevelMode = "compare" | "all" | 1 | 2 | 3 | 4 | 5;

const SKILL_SORT_FIELDS: readonly NumericSortField[] = [
  { key: "cardCount", labelKey: "skillsDictionary.sortCardCount" },
];

const FAMILY_TONES: Record<SkillFamily, string> = {
  live: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  leader: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  gekisou: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
  support: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  gekisouSupport: "bg-purple-500/15 text-purple-800 dark:text-purple-300",
};

function isSkillFamily(value: string | null): value is SkillFamily {
  return value !== null && (SKILL_FAMILIES as readonly string[]).includes(value);
}

function isCardType(value: number): value is CardType {
  return value >= 1 && value <= 5;
}

function toUpgradeSteps(steps: readonly CardMaterialStep[], assetUrl: (url: string) => string): UpgradeStep[] {
  return steps.map((step) => ({
    from: `Lv.${step.from}`,
    to: `Lv.${step.to}`,
    costs: step.costs.map((cost) => ({
      id: cost.id,
      name: cost.name,
      imageUrl: cost.imageUrl ? assetUrl(cost.imageUrl) : "",
      count: cost.count,
      ...(cost.link ? { href: entityLinkPath(cost.link) } : {}),
    })),
  }));
}

interface RememberedSkillFilters {
  query: string;
  families: SkillFamily[];
  bands: number[];
  levelMode: LevelMode;
  onlyOwned: boolean;
  onlyUpgradable: boolean;
}

function parseRememberedFilters(raw: string | undefined): RememberedSkillFilters {
  if (!raw) {
    return { query: "", families: [], bands: [], levelMode: "compare", onlyOwned: false, onlyUpgradable: false };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<RememberedSkillFilters>;
    const families = Array.isArray(parsed.families)
      ? parsed.families.filter((f): f is SkillFamily => isSkillFamily(String(f)))
      : [];
    const bands = Array.isArray(parsed.bands)
      ? parsed.bands.filter((b): b is number => typeof b === "number")
      : [];
    const validLevelModes: readonly LevelMode[] = ["compare", "all", 1, 2, 3, 4, 5];
    const levelMode = validLevelModes.includes(parsed.levelMode as LevelMode)
      ? (parsed.levelMode as LevelMode)
      : "compare";
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      families,
      bands,
      levelMode,
      onlyOwned: Boolean(parsed.onlyOwned),
      onlyUpgradable: Boolean(parsed.onlyUpgradable),
    };
  } catch {
    return { query: "", families: [], bands: [], levelMode: "compare", onlyOwned: false, onlyUpgradable: false };
  }
}

export default function SkillsExplorer({ locale, servers, initialCards, bands, skillDictionaries }: Props) {
  const memory = useListPageMemory("skills");
  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const { server, pickServer, items: memberCards } = useServerList(locale, servers, initialCards);
  const assetUrl = useServerAssetUrl(server);
  const sort = useListSort("skills", locale, "date", { numeric: SKILL_SORT_FIELDS });

  const [query, setQuery] = useState("");
  const [selectedFamilies, setSelectedFamilies] = useState<SkillFamily[]>([]);
  const [selectedBands, setSelectedBands] = useState<number[]>([]);
  const [levelMode, setLevelMode] = useState<LevelMode>("compare");
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [onlyUpgradable, setOnlyUpgradable] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [selectedUpgradeGroup, setSelectedUpgradeGroup] = useState<number | null>(null);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    const fromUrl = readQueryParam("family");
    setQuery(remembered.query);
    setSelectedFamilies(isSkillFamily(fromUrl) ? [fromUrl] : remembered.families);
    setSelectedBands(remembered.bands);
    setLevelMode(remembered.levelMode);
    setOnlyOwned(remembered.onlyOwned);
    setOnlyUpgradable(remembered.onlyUpgradable);
  }, [memory.state?.filtersHash]);

  useEffect(() => {
    if (!memory.state?.scrollY) return;
    const targetY = memory.state.scrollY;
    const handle = window.requestAnimationFrame(() => window.scrollTo({ top: targetY }));
    return () => window.cancelAnimationFrame(handle);
  }, [memory.state?.scrollY]);

  const saveCurrentState = useCallback(() => {
    const filtersHash = JSON.stringify({
      query,
      families: selectedFamilies,
      bands: selectedBands,
      levelMode,
      onlyOwned,
      onlyUpgradable,
    });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedFamilies, selectedBands, levelMode, onlyOwned, onlyUpgradable, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const syncFamilyUrl = (next: SkillFamily[]) => {
    setSelectedFamilies(next);
    replaceQueryParam("family", next.length === 1 ? next[0]! : null);
  };

  const memberMap = useMemo(() => {
    const map = new Map<number, CardViewModel>();
    for (const card of memberCards) {
      if (showSpoiler || !isSpoiler(card.startAt, now)) {
        map.set(card.id, card);
      }
    }
    return map;
  }, [memberCards, showSpoiler, now]);

  const dictionary = skillDictionaries[server];
  const entries = dictionary?.entries ?? [];

  const availableBands = useMemo(() => {
    const used = new Set(entries.flatMap((entry) => entry.bandIds));
    return bands.filter(([id]) => used.has(id));
  }, [entries, bands]);

  const upgradeGroupEntries = useMemo(() => {
    const groups = dictionary?.upgradeGroups ?? {};
    return Object.entries(groups)
      .map(([id, steps]) => [Number(id), steps] as const)
      .filter(([, steps]) => steps.length > 0)
      .sort(([a], [b]) => a - b);
  }, [dictionary?.upgradeGroups]);

  const activeUpgradeGroup =
    upgradeGroupEntries.find(([id]) => id === selectedUpgradeGroup) ?? upgradeGroupEntries[0] ?? null;

  const countsByFamily = useMemo(() => {
    const counts: Record<"all" | SkillFamily, number> = {
      all: entries.length,
      live: 0,
      leader: 0,
      gekisou: 0,
      support: 0,
      gekisouSupport: 0,
    };
    for (const entry of entries) counts[entry.family]++;
    return counts;
  }, [entries]);

  const ownerCountOf = useCallback(
    (entry: SkillDictionaryEntry) => {
      const mCount = entry.memberIds.filter((id) => memberMap.has(id)).length;
      const sCount = entry.supportOwners.filter((card) => showSpoiler || !isSpoiler(card.startAt, now)).length;
      return mCount + sCount;
    },
    [memberMap, showSpoiler, now],
  );

  /** Effective release date among currently visible (non-spoiler) owning cards. */
  const effectiveStartAt = useCallback(
    (entry: SkillDictionaryEntry) => {
      if (showSpoiler) return entry.startAt;
      const visibleDates = [
        ...entry.memberIds.map((id) => memberMap.get(id)?.startAt ?? ""),
        ...entry.supportOwners.filter((c) => !isSpoiler(c.startAt, now)).map((c) => c.startAt),
      ].filter(Boolean);
      if (visibleDates.length === 0) return "";
      return visibleDates.sort((a, b) => compareByStartDesc({ id: 0, startAt: a }, { id: 0, startAt: b }))[0] ?? "";
    },
    [showSpoiler, memberMap, now],
  );

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      if (selectedFamilies.length > 0 && !selectedFamilies.includes(entry.family)) return false;
      if (selectedBands.length > 0 && !entry.bandIds.some((id) => selectedBands.includes(id))) return false;
      if (onlyOwned && ownerCountOf(entry) === 0) return false;
      if (onlyUpgradable && entry.upgradeGroupIds.length === 0) return false;
      if (needle && !entry.searchText.includes(needle)) return false;
      return true;
    });
  }, [entries, selectedFamilies, selectedBands, onlyOwned, onlyUpgradable, ownerCountOf, query]);

  const sortedEntries = useMemo(() => {
    const decorated = filteredEntries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      startAt: effectiveStartAt(entry),
      entry,
    }));
    if (sort.value === "default") {
      return [...decorated]
        .sort((a, b) => compareByStartDesc(a, b) || b.id - a.id)
        .map((row) => row.entry);
    }
    return sortEntries(decorated, sort.value, locale, {
      numeric: { cardCount: (row) => ownerCountOf(row.entry) },
    }).map((row) => row.entry);
  }, [filteredEntries, sort.value, locale, effectiveStartAt, ownerCountOf]);

  const hasActiveFilters =
    sort.value !== "default" ||
    Boolean(query.trim()) ||
    selectedFamilies.length > 0 ||
    selectedBands.length > 0 ||
    levelMode !== "compare" ||
    onlyOwned ||
    onlyUpgradable;

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    syncFamilyUrl([]);
    setSelectedBands([]);
    setLevelMode("compare");
    setOnlyOwned(false);
    setOnlyUpgradable(false);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      locale={locale}
      sort={sort}
      variant="plain"
      title={t(locale, "skillsDictionary.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "skillsDictionary.searchPlaceholder")}
      resultCount={filteredEntries.length}
      totalCount={entries.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "skillsDictionary.familyLabel")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedFamilies.length === 0} onClick={() => syncFamilyUrl([])}>
            ALL
          </FilterButton>
          {SKILL_FAMILIES.map((family) => (
            <FilterButton
              key={family}
              active={selectedFamilies.includes(family)}
              onClick={() => syncFamilyUrl(toggleArrayItem(selectedFamilies, family))}
            >
              {t(locale, `skillsDictionary.families.${family}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>

      {availableBands.length > 0 && (
        <BandFilter
          title={t(locale, "skillsDictionary.bandLabel")}
          bands={availableBands}
          selectedBands={selectedBands}
          onChange={setSelectedBands}
        />
      )}

      <FilterSection title={t(locale, "skillsDictionary.compareLevels")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={levelMode === "compare"} onClick={() => setLevelMode("compare")}>
            {t(locale, "skillsDictionary.compareLevels")}
          </FilterButton>
          <FilterButton active={levelMode === "all"} onClick={() => setLevelMode("all")}>
            {t(locale, "skillsDictionary.expandAllLevels")}
          </FilterButton>
          {([1, 2, 3, 4, 5] as const).map((lv) => (
            <FilterButton key={lv} active={levelMode === lv} onClick={() => setLevelMode(lv)}>
              {t(locale, "skillsDictionary.levelSingle", { n: lv })}
            </FilterButton>
          ))}
        </div>
      </FilterSection>

      <div className="space-y-1">
        <FilterToggle
          checked={onlyOwned}
          onChange={setOnlyOwned}
          label={t(locale, "skillsDictionary.onlyOwned")}
        />
        <FilterToggle
          checked={onlyUpgradable}
          onChange={setOnlyUpgradable}
          label={t(locale, "skillsDictionary.onlyUpgradable")}
        />
      </div>
    </BaseFilters>
  );

  useQuickFilter(t(locale, "skillsDictionary.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedFamilies,
    selectedBands,
    availableBands,
    levelMode,
    onlyOwned,
    onlyUpgradable,
    hasActiveFilters,
    filteredEntries.length,
    entries.length,
    locale,
  ]);

  const cardsBase = localizePath(getRoutePathById("cards"), locale);
  const supportBase = localizePath(getRoutePathById("support-cards"), locale);
  const activeSingleTab = selectedFamilies.length === 1 ? selectedFamilies[0]! : selectedFamilies.length === 0 ? "all" : null;

  return (
    <ServerScope
      locale={locale}
      servers={servers}
      server={server}
      onChange={pickServer}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <FilterButton active={levelMode === "compare"} onClick={() => setLevelMode("compare")}>
            {t(locale, "skillsDictionary.compareLevels")}
          </FilterButton>
          <FilterButton active={levelMode === "all"} onClick={() => setLevelMode("all")}>
            {t(locale, "skillsDictionary.expandAllLevels")}
          </FilterButton>
        </div>
      }
    >
      {/* Standard MD3 PrimaryTabs for 1-click skill family switching */}
      <div className="md3-tabs mb-4" role="tablist" aria-label={t(locale, "skillsDictionary.familyLabel")}>
        {(["all", ...SKILL_FAMILIES] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeSingleTab === key}
            onClick={() => syncFamilyUrl(key === "all" ? [] : [key])}
            className="md3-tab md3-state"
          >
            {t(locale, `skillsDictionary.families.${key}`)}
            <span className="ml-1.5 text-label-small tabular-nums opacity-70">{countsByFamily[key]}</span>
          </button>
        ))}
      </div>

      {/* Collapsible Universal Skill Upgrade Materials Reference */}
      {activeUpgradeGroup && (
        <details className="md3-surface group mb-4 overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-title-small text-on-surface hover:bg-surface-container-low">
            <span>{t(locale, "skillsDictionary.upgradeMaterials")}</span>
            <Icon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-outline-variant/70 p-4">
            {upgradeGroupEntries.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {upgradeGroupEntries.map(([groupId]) => (
                  <FilterButton
                    key={groupId}
                    active={activeUpgradeGroup[0] === groupId}
                    onClick={() => setSelectedUpgradeGroup(groupId)}
                  >
                    {t(locale, "skillsDictionary.upgradeGroup", { id: groupId })}
                  </FilterButton>
                ))}
              </div>
            )}
            <UpgradeCostTable
              locale={locale}
              steps={toUpgradeSteps(activeUpgradeGroup[1], assetUrl)}
              cumulative
            />
          </div>
        </details>
      )}

      {/* Dense Skills List */}
      <section className="min-w-0" aria-live="polite">
        {sortedEntries.length === 0 ? (
          <div className="md3-surface p-8 text-center">
            <p className="text-body-medium text-on-surface-variant">{t(locale, "skillsDictionary.empty")}</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="md3-button md3-button--tonal mt-4"
              >
                {t(locale, "filter.reset")}
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {sortedEntries.map((entry) => (
              <SkillEntryCard
                key={entry.key}
                locale={locale}
                entry={entry}
                levelMode={levelMode}
                expanded={levelMode === "all" || Boolean(expandedKeys[entry.key])}
                onToggleExpand={() =>
                  setExpandedKeys((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }))
                }
                memberMap={memberMap}
                showSpoiler={showSpoiler}
                now={now}
                assetUrl={assetUrl}
                cardsBase={cardsBase}
                supportBase={supportBase}
                onOpenCard={saveCurrentState}
              />
            ))}
          </ul>
        )}
      </section>
    </ServerScope>
  );
}

function SkillEntryCard({
  locale,
  entry,
  levelMode,
  expanded,
  onToggleExpand,
  memberMap,
  showSpoiler,
  now,
  assetUrl,
  cardsBase,
  supportBase,
  onOpenCard,
}: {
  locale: AppLocale;
  entry: SkillDictionaryEntry;
  levelMode: LevelMode;
  expanded: boolean;
  onToggleExpand: () => void;
  memberMap: ReadonlyMap<number, CardViewModel>;
  showSpoiler: boolean;
  now: number | null;
  assetUrl: (url: string) => string;
  cardsBase: string;
  supportBase: string;
  onOpenCard: () => void;
}) {
  const firstLevel = entry.levels[0];
  const lastLevel = entry.levels.at(-1);
  const hasMultiLevels = entry.levels.length > 1;
  const chosenSingle =
    typeof levelMode === "number"
      ? (entry.levels.find((lv) => lv.level === levelMode) ?? lastLevel ?? firstLevel)
      : null;

  const memberOwners = entry.memberIds
    .map((id) => memberMap.get(id))
    .filter((card): card is CardViewModel => Boolean(card));
  const supportOwners = entry.supportOwners.filter((card) => showSpoiler || !isSpoiler(card.startAt, now));
  const totalOwners = memberOwners.length + supportOwners.length;

  return (
    <li className="md3-surface border border-outline-variant p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {entry.iconUrl && (
            <img
              src={assetUrl(entry.iconUrl)}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-8 w-8 shrink-0 rounded-shape-sm bg-surface-container-high object-contain p-0.5"
            />
          )}
          <span className={`shrink-0 rounded-shape-full px-2.5 py-0.5 text-label-small font-semibold ${FAMILY_TONES[entry.family]}`}>
            {t(locale, `skillsDictionary.families.${entry.family}`)}
          </span>
          <h3 className="truncate text-title-small font-semibold text-on-surface">{entry.name}</h3>
          <span className="shrink-0 font-mono text-label-small text-on-surface-variant">#{entry.id}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-label-small text-on-surface-variant">
            {totalOwners > 0
              ? t(locale, "skillsDictionary.ownersCount", { count: totalOwners })
              : t(locale, "skillsDictionary.noOwners")}
          </span>
          {hasMultiLevels && levelMode !== "all" && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="md3-button md3-button--text md3-button--small"
            >
              {t(locale, expanded ? "skillsDictionary.collapseLevels" : "skillsDictionary.expandAllLevels")}
            </button>
          )}
        </div>
      </div>

      {/* Effect Value Display */}
      <div className="mt-2.5">
        {expanded && hasMultiLevels ? (
          <div className="grid gap-1.5 rounded-shape-md border border-outline-variant/60 bg-surface-container-lowest p-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {entry.levels.map((lv) => (
              <div key={lv.level} className="flex items-baseline gap-2 rounded-shape-xs bg-surface-container-low px-2.5 py-1.5 text-body-small">
                <span className="shrink-0 font-mono text-label-small font-bold text-primary">Lv.{lv.level}</span>
                <span className="text-on-surface">{lv.description || "—"}</span>
              </div>
            ))}
          </div>
        ) : levelMode === "compare" && hasMultiLevels && firstLevel && lastLevel && firstLevel.level !== lastLevel.level ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-baseline gap-2 rounded-shape-sm border border-outline-variant/50 bg-surface-container-low px-3 py-2 text-body-small">
              <span className="shrink-0 font-mono text-label-small font-semibold text-on-surface-variant">
                Lv.{firstLevel.level}
              </span>
              <span className="text-on-surface">{firstLevel.description || "—"}</span>
            </div>
            <div className="flex items-baseline gap-2 rounded-shape-sm border border-primary/30 bg-primary-container/25 px-3 py-2 text-body-small">
              <span className="shrink-0 font-mono text-label-small font-bold text-primary">
                Lv.{lastLevel.level}
              </span>
              <span className="font-medium text-on-surface">{lastLevel.description || "—"}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-baseline gap-2 rounded-shape-sm bg-surface-container-low px-3 py-2 text-body-small">
            {chosenSingle && (
              <span className="shrink-0 font-mono text-label-small font-semibold text-primary">
                Lv.{chosenSingle.level}
              </span>
            )}
            <span className="text-on-surface">{(chosenSingle ?? firstLevel)?.description || "—"}</span>
          </div>
        )}
      </div>

      {/* Owning Member & Support Cards Reverse Lookup Strip */}
      {totalOwners > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {memberOwners.map((card) => (
            <a
              key={`m:${card.id}`}
              href={`${cardsBase}/${card.id}`}
              onClick={onOpenCard}
              className="inline-flex max-w-full items-center gap-1.5 rounded-shape-full border border-outline-variant bg-surface-container-low py-0.5 pl-1 pr-2.5 text-label-small text-on-surface hover:border-primary hover:text-primary"
            >
              <img
                src={assetUrl(getCardThumbnailUrl(card.assetId))}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-5 w-5 shrink-0 rounded-shape-full object-cover"
              />
              {isCardType(card.cardType) && (
                <img src={getCardTypeIconUrl(card.cardType)} alt="" className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">
                {card.characterName}
                {card.title && card.title !== card.characterName ? ` · ${card.title}` : ""}
              </span>
            </a>
          ))}
          {supportOwners.map((card) => (
            <a
              key={`s:${card.id}`}
              href={`${supportBase}/${card.id}`}
              onClick={onOpenCard}
              className="inline-flex max-w-full items-center gap-1.5 rounded-shape-full border border-outline-variant bg-surface-container-low py-0.5 pl-1 pr-2.5 text-label-small text-on-surface hover:border-primary hover:text-primary"
            >
              <img
                src={assetUrl(getSupportCardThumbnailUrl(card.assetId))}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-5 w-5 shrink-0 rounded-shape-full object-cover"
              />
              {isCardType(card.cardType) && (
                <img src={getCardTypeIconUrl(card.cardType)} alt="" className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{card.title}</span>
            </a>
          ))}
        </div>
      )}
    </li>
  );
}

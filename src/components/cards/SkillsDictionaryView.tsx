"use client";

import { useEffect, useMemo, useState } from "react";
import UpgradeCostTable, { type UpgradeStep } from "@/components/shared/UpgradeCostTable";
import { Icon } from "@/components/shared/icons";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getCardThumbnailUrl, getCardTypeIconUrl, type CardType } from "@/lib/cards/assets";
import type { CardViewModel } from "@/lib/cards/data";
import type { CardMaterialStep } from "@/lib/cards/materials";
import { entityLinkPath } from "@/lib/route/entity-link";
import { getRoutePathById } from "@/lib/route/registry";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";
import { useNow } from "@/lib/schedule/use-now";
import {
  SKILL_FAMILIES,
  type SkillDictionaryEntry,
  type SkillDictionaryViewModel,
  type SkillFamily,
} from "@/lib/skills/dictionary";
import { getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";

interface Props {
  locale: AppLocale;
  dictionary: SkillDictionaryViewModel | undefined;
  memberCards: readonly CardViewModel[];
}

type FamilyFilter = "all" | SkillFamily;
type LevelMode = "compare" | 1 | 2 | 3 | 4 | 5;

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

export default function SkillsDictionaryView({ locale, dictionary, memberCards }: Props) {
  const assetUrl = useAssetUrl();
  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const [family, setFamily] = useState<FamilyFilter>("all");
  const [query, setQuery] = useState("");
  const [levelMode, setLevelMode] = useState<LevelMode>("compare");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [selectedUpgradeGroup, setSelectedUpgradeGroup] = useState<number | null>(null);

  useEffect(() => {
    const fromUrl = readQueryParam("family");
    if (isSkillFamily(fromUrl)) setFamily(fromUrl);
  }, []);

  const pickFamily = (next: FamilyFilter) => {
    setFamily(next);
    replaceQueryParam("family", next === "all" ? null : next);
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

  const entries = dictionary?.entries ?? [];
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
    const counts: Record<FamilyFilter, number> = {
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

  const needle = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (family !== "all" && entry.family !== family) return false;
      if (needle && !entry.searchText.includes(needle)) return false;
      return true;
    });
  }, [entries, family, needle]);

  const cardsBase = localizePath(getRoutePathById("cards"), locale);
  const supportBase = localizePath(getRoutePathById("support-cards"), locale);

  return (
    <div className="space-y-4">
      {/* Search, Family Filter & Level Mode Controls */}
      <section className="md3-surface space-y-3.5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(locale, "skillsDictionary.searchPlaceholder")}
            aria-label={t(locale, "filter.search")}
            className="md3-text-field md3-search-field !h-11 flex-1 !px-4"
          />

          <div className="md3-segmented w-fit shrink-0" role="group">
            <button
              type="button"
              aria-pressed={levelMode === "compare"}
              onClick={() => setLevelMode("compare")}
              className="md3-segment md3-state"
            >
              {t(locale, "skillsDictionary.compareLevels")}
            </button>
            {([1, 2, 3, 4, 5] as const).map((lv) => (
              <button
                key={lv}
                type="button"
                aria-pressed={levelMode === lv}
                onClick={() => setLevelMode(lv)}
                className="md3-segment md3-state"
              >
                {t(locale, "skillsDictionary.levelSingle", { n: lv })}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t(locale, "skillsDictionary.familyLabel")}>
          {(["all", ...SKILL_FAMILIES] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={family === key}
              onClick={() => pickFamily(key)}
              className="md3-filter-chip md3-state"
            >
              <span>{t(locale, `skillsDictionary.families.${key}`)}</span>
              <span className="ml-1 font-mono text-[11px] opacity-75">{countsByFamily[key]}</span>
            </button>
          ))}
        </div>

        {/* Collapsible Universal Skill Upgrade Materials Reference */}
        {activeUpgradeGroup && (
          <details className="group rounded-shape-md border border-outline-variant/70 bg-surface-container-lowest">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-label-large text-on-surface hover:bg-surface-container-low">
              <span>{t(locale, "skillsDictionary.upgradeMaterials")}</span>
              <Icon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-outline-variant/70 p-3.5">
              {upgradeGroupEntries.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {upgradeGroupEntries.map(([groupId]) => (
                    <button
                      key={groupId}
                      type="button"
                      aria-pressed={activeUpgradeGroup[0] === groupId}
                      onClick={() => setSelectedUpgradeGroup(groupId)}
                      className="md3-filter-chip md3-state"
                    >
                      {t(locale, "skillsDictionary.upgradeGroup", { id: groupId })}
                    </button>
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
      </section>

      {/* Dense Skills List */}
      {filtered.length === 0 ? (
        <div className="md3-surface p-8 text-center">
          <p className="text-body-medium text-on-surface-variant">{t(locale, "skillsDictionary.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((entry) => (
            <SkillEntryCard
              key={entry.key}
              locale={locale}
              entry={entry}
              levelMode={levelMode}
              expanded={Boolean(expandedKeys[entry.key])}
              onToggleExpand={() =>
                setExpandedKeys((prev) => ({ ...prev, [entry.key]: !prev[entry.key] }))
              }
              memberMap={memberMap}
              showSpoiler={showSpoiler}
              now={now}
              assetUrl={assetUrl}
              cardsBase={cardsBase}
              supportBase={supportBase}
            />
          ))}
        </ul>
      )}
    </div>
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
          {hasMultiLevels && (
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

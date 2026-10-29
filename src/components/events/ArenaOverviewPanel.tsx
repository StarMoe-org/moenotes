"use client";

import { useEffect, useMemo, useState } from "react";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import { Icon } from "@/components/shared/icons";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import {
  buildArenaDeckQuery,
  nextArenaTransitionAt,
  selectActiveLeagueRuleIndex,
  selectDefaultArenaSeason,
  type ArenaCatalogViewModel,
  type ArenaLeagueViewModel,
  type ArenaRangeRewardViewModel,
  type ArenaRuleViewModel,
} from "@/lib/arena/data";
import { getBandSmallIconUrl, getCardTypeIconUrl, type CardType } from "@/lib/cards/assets";
import { getRoutePathById } from "@/lib/route/registry";
import { formatMasterDate, formatScheduleRange } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";
import { useAssetUrl } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  catalog: ArenaCatalogViewModel | undefined;
}

const REWARD_TABS = ["ranks", "daily", "season"] as const;
type RewardTab = (typeof REWARD_TABS)[number];

function isCardType(value: number): value is CardType {
  return value >= 1 && value <= 5;
}

function formatDurationLeft(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function ArenaOverviewPanel({ locale, catalog }: Props) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const assetUrl = useAssetUrl();
  const seasons = catalog?.seasons ?? [];
  const defaultSeason = useMemo(() => selectDefaultArenaSeason(seasons, now), [seasons, now]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [rewardTab, setRewardTab] = useState<RewardTab>("ranks");
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);

  const season = useMemo(
    () => seasons.find((entry) => entry.id === selectedSeasonId) ?? defaultSeason,
    [seasons, selectedSeasonId, defaultSeason],
  );

  const nextTransition = useMemo(() => nextArenaTransitionAt(season, now), [season, now]);

  if (!season || seasons.length === 0) {
    return (
      <div className="md3-surface p-8 text-center sm:p-12">
        <p className="text-body-large text-on-surface-variant">{t(locale, "arenaOverview.empty")}</p>
      </div>
    );
  }

  const activeRewardLeague =
    season.leagues.find((entry) => entry.id === selectedLeagueId) ?? season.leagues[0] ?? null;

  return (
    <div className="space-y-5">
      {/* Season Header & Live Schedule Strip */}
      <section className="md3-surface flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {seasons.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t(locale, "arenaOverview.seasonLabel")}>
                {seasons.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={entry.id === season.id}
                    onClick={() => setSelectedSeasonId(entry.id)}
                    className="md3-filter-chip md3-state"
                  >
                    {entry.title}
                  </button>
                ))}
              </div>
            ) : (
              <h2 className="text-title-large font-semibold text-on-surface">{season.title}</h2>
            )}
            <ScheduleBadge locale={locale} startAt={season.startAt} endAt={season.endAt} now={now} />
            <ScheduleCountdown locale={locale} startAt={season.startAt} endAt={season.endAt} now={now} />
          </div>

          {now !== null && nextTransition !== null && nextTransition > now && (
            <div className="inline-flex items-center gap-2 rounded-shape-full bg-secondary-container px-3.5 py-1 text-label-medium text-on-secondary-container tabular-nums">
              <span>{t(locale, "arenaOverview.nextTransition")}</span>
              <strong>{formatDurationLeft(nextTransition - now)}</strong>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-body-small text-on-surface-variant tabular-nums">
          <span>{formatScheduleRange(season.startAt, season.endAt, locale, timeZone)}</span>
          {season.rankingEndAt && season.rankingEndAt !== season.endAt && (
            <span>
              {t(locale, "arenaOverview.rankingEndAt", {
                time: formatMasterDate(season.rankingEndAt, locale, true, timeZone),
              })}
            </span>
          )}
        </div>
      </section>

      {/* 5-Band League Rotation Grid */}
      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {season.leagues.map((league) => (
          <LeagueCard
            key={`${season.id}:${league.id}`}
            locale={locale}
            league={league}
            now={now}
            timeZone={timeZone}
            assetUrl={assetUrl}
          />
        ))}
      </section>

      {/* Consolidated Rank LP & Rewards Section */}
      <section className="md3-surface space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-title-medium font-semibold text-on-surface">
            {t(locale, "arenaOverview.rewardsHeading")}
          </h3>
          <div className="md3-segmented w-fit" role="group" aria-label={t(locale, "arenaOverview.rewardsHeading")}>
            {REWARD_TABS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={rewardTab === key}
                onClick={() => setRewardTab(key)}
                className="md3-segment md3-state"
              >
                {t(locale, `arenaOverview.rewardTabs.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {rewardTab === "ranks" ? (
          <div className="space-y-3">
            {season.leagues.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t(locale, "arenaOverview.rankBandLabel")}>
                {season.leagues.map((league) => (
                  <button
                    key={league.id}
                    type="button"
                    aria-pressed={activeRewardLeague?.id === league.id}
                    onClick={() => setSelectedLeagueId(league.id)}
                    className="md3-filter-chip md3-state inline-flex items-center gap-1.5"
                  >
                    <img src={assetUrl(getBandSmallIconUrl(league.bandId))} alt="" className="h-4 w-4 object-contain" />
                    <span>{league.name}</span>
                  </button>
                ))}
              </div>
            )}
            {!activeRewardLeague || activeRewardLeague.ranks.length === 0 ? (
              <p className="text-body-medium text-on-surface-variant">{t(locale, "arenaOverview.noRewards")}</p>
            ) : (
              <div className="overflow-x-auto rounded-shape-md border border-outline-variant">
                <table className="w-full min-w-[520px] border-collapse text-left text-body-small">
                  <thead className="bg-surface-container text-label-medium text-on-surface-variant">
                    <tr>
                      <th className="px-3.5 py-2.5">{t(locale, "arenaOverview.columns.rank")}</th>
                      <th className="px-3.5 py-2.5 text-right">{t(locale, "arenaOverview.columns.lp")}</th>
                      <th className="px-3.5 py-2.5">{t(locale, "arenaOverview.columns.promotion")}</th>
                      <th className="px-3.5 py-2.5">{t(locale, "arenaOverview.columns.daily")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/60">
                    {activeRewardLeague.ranks.map((step) => (
                      <tr key={step.id} className="hover:bg-surface-container-low">
                        <td className="px-3.5 py-2 font-medium text-on-surface">
                          {step.name || `Rank ${step.rank}${step.division > 0 ? `-${step.division}` : ""}`}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular-nums text-on-surface">
                          {new Intl.NumberFormat(locale).format(step.lp)}
                        </td>
                        <td className="px-3.5 py-2">
                          <RewardList locale={locale} rewards={step.promotionRewards} />
                        </td>
                        <td className="px-3.5 py-2">
                          <RewardList locale={locale} rewards={step.dailyRewards} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <RangeRewardTable
            locale={locale}
            rows={rewardTab === "daily" ? season.dailyRewards : season.seasonRewards}
          />
        )}
      </section>
    </div>
  );
}

function LeagueCard({
  locale,
  league,
  now,
  timeZone,
  assetUrl,
}: {
  locale: AppLocale;
  league: ArenaLeagueViewModel;
  now: number | null;
  timeZone: string | null;
  assetUrl: (url: string) => string;
}) {
  const liveIndex = useMemo(() => selectActiveLeagueRuleIndex(league.rules, now), [league.rules, now]);
  const [weekIndex, setWeekIndex] = useState<number>(() => Math.max(0, liveIndex));

  useEffect(() => {
    if (liveIndex >= 0) setWeekIndex(liveIndex);
  }, [liveIndex]);

  const rule: ArenaRuleViewModel | null = league.rules[weekIndex] ?? league.rules[0] ?? null;
  const isLiveWeek = weekIndex === liveIndex && liveIndex >= 0;

  const deckBase = localizePath(getRoutePathById("deck"), locale);
  const deckHref = `${deckBase}?${buildArenaDeckQuery({
    leagueId: league.id,
    bandId: league.bandId,
    rule,
    isLiveRule: isLiveWeek,
  })}`;

  return (
    <article
      className="md3-surface flex flex-col gap-3.5 overflow-hidden border border-outline-variant p-4"
      style={league.color ? { borderTopWidth: "3px", borderTopColor: league.color } : undefined}
    >
      {/* Band Header + 1-Click Jump to Deck Solver */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src={assetUrl(getBandSmallIconUrl(league.bandId))}
            alt=""
            className="h-7 w-7 shrink-0 object-contain"
          />
          <h3 className="truncate text-title-medium font-semibold text-on-surface">{league.name}</h3>
        </div>
        <a href={deckHref} className="md3-button md3-button--tonal md3-button--small shrink-0">
          {t(locale, isLiveWeek ? "arenaOverview.openDeck" : "arenaOverview.openDeckWeek")}
        </a>
      </header>

      {/* Active / Selected Weekly Regulation Box */}
      {rule ? (
        <div className="rounded-shape-md border border-outline-variant/80 bg-surface-container-low p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-label-large font-semibold text-on-surface">
                {t(locale, "arenaOverview.weekIndex", { n: weekIndex + 1 })}
              </span>
              {isLiveWeek && (
                <span className="rounded-shape-full bg-primary-container px-2.5 py-0.5 text-label-small font-semibold text-on-primary-container">
                  {t(locale, "arenaOverview.liveWeek")}
                </span>
              )}
            </div>
            {league.rules.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={weekIndex <= 0}
                  onClick={() => setWeekIndex((idx) => Math.max(0, idx - 1))}
                  aria-label={t(locale, "arenaOverview.prevWeek")}
                  className="md3-icon-button md3-icon-button--small"
                >
                  <Icon name="chevronLeft" className="h-4 w-4" />
                </button>
                <span className="text-label-small tabular-nums text-on-surface-variant">
                  {weekIndex + 1}/{league.rules.length}
                </span>
                <button
                  type="button"
                  disabled={weekIndex >= league.rules.length - 1}
                  onClick={() => setWeekIndex((idx) => Math.min(league.rules.length - 1, idx + 1))}
                  aria-label={t(locale, "arenaOverview.nextWeek")}
                  className="md3-icon-button md3-icon-button--small"
                >
                  <Icon name="chevronRight" className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <p className="mt-1 text-body-small tabular-nums text-on-surface-variant">
            {formatScheduleRange(rule.startAt, rule.endAt, locale, timeZone)}
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-shape-sm bg-surface-container px-2.5 py-1.5">
              <span className="text-label-small text-on-surface-variant">
                {t(locale, "arenaOverview.musicAttribute")}
              </span>
              <AttributePill locale={locale} musicType={rule.musicType} />
            </div>
            <div className="flex items-center justify-between gap-1.5 rounded-shape-sm bg-surface-container px-2.5 py-1.5">
              <span className="shrink-0 text-label-small text-on-surface-variant">
                {t(locale, "arenaOverview.missionsLabel")}
              </span>
              <div className="flex flex-wrap justify-end gap-1">
                {rule.missions.map((mission, idx) => (
                  <MissionBadge key={idx} locale={locale} slot={idx + 1} mission={mission} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Collapsible Full Rotation Schedule */}
      {league.rules.length > 1 && (
        <details className="group rounded-shape-md border border-outline-variant/60 bg-surface-container-lowest">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-label-medium text-on-surface-variant hover:text-on-surface">
            <span>{t(locale, "arenaOverview.allRotations", { count: league.rules.length })}</span>
            <Icon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-outline-variant/50 border-t border-outline-variant/60 text-body-small">
            {league.rules.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setWeekIndex(idx)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-left transition ${
                    idx === weekIndex ? "bg-secondary-container/50 font-medium text-on-surface" : "hover:bg-surface-container-low"
                  }`}
                >
                  <span className="tabular-nums">
                    {t(locale, "arenaOverview.weekIndex", { n: idx + 1 })}
                    {idx === liveIndex ? ` · ${t(locale, "arenaOverview.liveWeek")}` : ""}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <AttributePill locale={locale} musicType={item.musicType} compact />
                    <span className="font-mono text-label-small text-on-surface-variant">
                      {item.missions.map((m) => t(locale, `arenaOverview.missions.${m}`)).join("/")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Collapsible Band Eligible Song Pool */}
      {league.songs.length > 0 && (
        <details className="group mt-auto rounded-shape-md border border-outline-variant/60 bg-surface-container-lowest">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-label-medium text-on-surface-variant hover:text-on-surface">
            <span>{t(locale, "arenaOverview.songPool", { count: league.songs.length })}</span>
            <Icon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto border-t border-outline-variant/60 p-2.5">
            {league.songs.map((song) => (
              <a
                key={song.id}
                href={localizePath(`${getRoutePathById("music")}/${song.id}`, locale)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-shape-full border border-outline-variant bg-surface-container-low py-0.5 pl-1 pr-2.5 text-label-small text-on-surface hover:border-primary hover:text-primary"
              >
                <img
                  src={assetUrl(song.jacketUrl)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-5 w-5 shrink-0 rounded-shape-full object-cover"
                />
                {isCardType(song.musicType) && (
                  <img src={getCardTypeIconUrl(song.musicType)} alt="" className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{song.title}</span>
                {song.expertLevel !== null && (
                  <span className="shrink-0 font-mono text-[11px] text-on-surface-variant">EX {song.expertLevel}</span>
                )}
              </a>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function AttributePill({
  locale,
  musicType,
  compact = false,
}: {
  locale: AppLocale;
  musicType: number;
  compact?: boolean;
}) {
  if (isCardType(musicType)) {
    return (
      <span className="inline-flex items-center gap-1 text-label-small font-semibold text-on-surface">
        <img src={getCardTypeIconUrl(musicType)} alt="" className="h-4 w-4 shrink-0" />
        {!compact && <span>{t(locale, `cards.attributes.${musicType}`)}</span>}
      </span>
    );
  }
  const label =
    musicType === 99
      ? t(locale, "arenaOverview.attributeAll")
      : t(locale, "arenaOverview.attributeDefault");
  return <span className="text-label-small font-medium text-on-surface">{label}</span>;
}

function MissionBadge({ locale, slot, mission }: { locale: AppLocale; slot: number; mission: number }) {
  const tone =
    mission === 1
      ? "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300"
      : mission === 2
        ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
        : mission === 3
          ? "bg-purple-500/15 text-purple-800 dark:text-purple-300"
          : "bg-surface-container-high text-on-surface-variant";
  return (
    <span
      title={t(locale, "arenaOverview.missionSlot", { n: slot })}
      className={`rounded-shape-xs px-1.5 py-0.5 font-mono text-[11px] font-semibold ${tone}`}
    >
      {t(locale, `arenaOverview.missions.${mission}`)}
    </span>
  );
}

function RewardList({ locale, rewards }: { locale: AppLocale; rewards: ArenaRangeRewardViewModel["reward"][] }) {
  if (rewards.length === 0) return <span className="text-on-surface-variant">—</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rewards.map((reward, index) => (
        <li key={`${reward.kind}:${reward.id}:${index}`}>
          <RewardChip locale={locale} reward={reward} />
        </li>
      ))}
    </ul>
  );
}

function RangeRewardTable({
  locale,
  rows,
}: {
  locale: AppLocale;
  rows: readonly ArenaRangeRewardViewModel[];
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, { labelKey: { from: number; to: number }; rewards: ArenaRangeRewardViewModel["reward"][] }>();
    for (const row of rows) {
      const key = `${row.rankId}:${row.from}:${row.to}`;
      const existing = map.get(key);
      if (existing) existing.rewards.push(row.reward);
      else map.set(key, { labelKey: { from: row.from || row.rankId, to: row.to }, rewards: [row.reward] });
    }
    return [...map.values()];
  }, [rows]);

  if (grouped.length === 0) {
    return <p className="text-body-medium text-on-surface-variant">{t(locale, "arenaOverview.noRewards")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-shape-md border border-outline-variant">
      <table className="w-full min-w-[420px] border-collapse text-left text-body-small">
        <thead className="bg-surface-container text-label-medium text-on-surface-variant">
          <tr>
            <th className="px-3.5 py-2.5">{t(locale, "arenaOverview.columns.range")}</th>
            <th className="px-3.5 py-2.5">{t(locale, "arenaOverview.columns.reward")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/60">
          {grouped.map((group, idx) => {
            const { from, to } = group.labelKey;
            const rangeText =
              to > from
                ? t(locale, "arenaOverview.rangeSpan", { from, to })
                : t(locale, "arenaOverview.rangeSingle", { from: from || idx + 1 });
            return (
              <tr key={idx} className="hover:bg-surface-container-low">
                <td className="px-3.5 py-2 font-mono tabular-nums text-on-surface">{rangeText}</td>
                <td className="px-3.5 py-2">
                  <RewardList locale={locale} rewards={group.rewards} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

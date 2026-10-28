"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import BannerImage from "@/components/shared/BannerImage";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import ServerAvailabilityBadge from "@/components/shared/ServerAvailabilityBadge";
import ServerScope from "@/components/shared/ServerScope";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import type { LimitedMissionGroupSummary } from "@/lib/masterdata/build-missions";
import { missionCategoryKey, parseMissionsDeepLink, type MissionCategoryViewModel, type RegularMissionViewModel } from "@/lib/missions/data";
import { entityLinkPath } from "@/lib/route/entity-link";
import { replaceQueryParam } from "@/lib/route/url-state";
import { formatScheduleRange } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerList } from "@/lib/servers/use-content-server";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  categories: ServerFaceted<MissionCategoryViewModel>[];
  limitedGroups: ServerFaceted<LimitedMissionGroupSummary>[];
  servers: GameServer[];
}

/** A tab: one regular category (its MasterMission category id) or the limited groups. */
type Tab = number | "limited";

const tabClass = (active: boolean) => ` md3-state shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition sm:text-sm ${
  active
    ? "border-primary bg-primary text-on-primary shadow-elevation-1"
    : "border-outline-variant bg-surface-container-low text-on-surface hover:border-primary/50"
}`;

/**
 * Regular missions by category, and the limited mission groups (each linking to its rewards page). `?mode=regular|limited&id=`
 * opens the tab holding that mission (or limited group), scrolls to it and highlights it.
 */
export default function MissionsExplorer({ locale, servers, categories: initialCategories, limitedGroups: initialGroups }: Props) {
  const { server, pickServer, items: categories } = useServerList(locale, servers, initialCategories);
  const groups = useMemo(() => initialGroups.filter((group) => group.servers.includes(server)), [initialGroups, server]);
  const { showSpoiler, now } = useSpoilerSetting();

  const visibleCategories = useMemo(() => {
    if (showSpoiler || now === null) return categories;
    return categories.map((cat) => ({
      ...cat,
      missions: cat.missions.filter((mission) => !isSpoiler(mission.startAt, now)),
    }));
  }, [categories, showSpoiler, now]);

  const visibleGroups = useMemo(() => {
    if (showSpoiler || now === null) return groups;
    return groups.filter((group) => !isSpoiler(group.startAt, now));
  }, [groups, showSpoiler, now]);

  const [tab, setTab] = useState<Tab | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const pendingScroll = useRef<string | null>(null);

  // The deep link is read once in the browser; the static HTML shows the first tab.
  useEffect(() => {
    const { mode, id } = parseMissionsDeepLink(window.location.search);
    if (mode === "limited") {
      setTab("limited");
      const group = id === null ? undefined : visibleGroups.find((entry) => entry.id === id || entry.missionIds.includes(id));
      if (group) setHighlight(`limited-${group.id}`);
    } else if (mode === "regular" || id !== null) {
      const category = id === null ? undefined : visibleCategories.find((entry) => entry.missions.some((mission) => mission.id === id));
      if (category) {
        setTab(category.id);
        setHighlight(`mission-${id}`);
      }
    }
    // Only on load: later tab changes are the reader's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pendingScroll.current = highlight;
  }, [highlight]);

  const activeTab: Tab = tab ?? visibleCategories[0]?.id ?? "limited";
  const active = typeof activeTab === "number" ? visibleCategories.find((category) => category.id === activeTab) : undefined;

  useEffect(() => {
    const target = pendingScroll.current;
    if (!target) return;
    const handle = window.requestAnimationFrame(() => {
      const element = document.getElementById(target);
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      pendingScroll.current = null;
    });
    return () => window.cancelAnimationFrame(handle);
  }, [activeTab, highlight, visibleCategories, visibleGroups]);

  const pick = (next: Tab) => {
    setTab(next);
    setHighlight(null);
    replaceQueryParam("mode", next === "limited" ? "limited" : "regular");
    replaceQueryParam("id", null);
  };

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <nav aria-label={t(locale, "missions.tabs")} className="mn-scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {visibleCategories.map((category) => (
          <button key={category.id} type="button" onClick={() => pick(category.id)} aria-pressed={activeTab === category.id} className={tabClass(activeTab === category.id)}>
            {t(locale, `missions.categories.${missionCategoryKey(category.id)}`)}
            <span className="ml-1.5 font-mono text-label-small opacity-70">{category.missions.length}</span>
          </button>
        ))}
        <button type="button" onClick={() => pick("limited")} aria-pressed={activeTab === "limited"} className={tabClass(activeTab === "limited")}>
          {t(locale, "missions.limited")}
          <span className="ml-1.5 font-mono text-label-small opacity-70">{visibleGroups.length}</span>
        </button>
      </nav>

      <div className="mt-5" aria-live="polite">
        {activeTab === "limited" ? (
          <LimitedGroups locale={locale} groups={visibleGroups} servers={servers} highlight={highlight} />
        ) : active ? (
          <MissionList locale={locale} category={active} highlight={highlight} />
        ) : (
          <p className="md3-surface p-8 text-center text-body-medium text-on-surface-variant">{t(locale, "missions.empty")}</p>
        )}
      </div>
    </ServerScope>
  );
}

function MissionList({ locale, category, highlight }: { locale: AppLocale; category: MissionCategoryViewModel; highlight: string | null }) {
  if (!category.missions.length) return <p className="md3-surface p-8 text-center text-body-medium text-on-surface-variant">{t(locale, "missions.empty")}</p>;
  return (
    <div className="md3-surface overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_6rem_minmax(0,16rem)] gap-6 border-b border-outline-variant px-6 py-3 text-label-medium text-on-surface-variant md:grid">
        <span>{t(locale, "missions.columns.mission")}</span>
        <span className="text-right">{t(locale, "missions.columns.goal")}</span>
        <span>{t(locale, "missions.columns.rewards")}</span>
      </div>
      <ol className="divide-y divide-dashed divide-outline-variant/60">
        {category.missions.map((mission) => <MissionRow key={mission.id} locale={locale} mission={mission} highlighted={highlight === `mission-${mission.id}`} />)}
      </ol>
    </div>
  );
}

function MissionRow({ locale, mission, highlighted }: { locale: AppLocale; mission: RegularMissionViewModel; highlighted: boolean }) {
  return (
    <li
      id={`mission-${mission.id}`}
      className={`grid scroll-mt-28 gap-3 px-4 py-3.5 transition-colors sm:px-6 md:grid-cols-[minmax(0,1fr)_6rem_minmax(0,16rem)] md:items-center md:gap-6 ${highlighted ? "bg-secondary-container ring-2 ring-inset ring-primary" : ""}`}
      aria-current={highlighted ? "true" : undefined}
    >
      <div className="min-w-0">
        <p className="whitespace-pre-line text-body-medium leading-6 text-on-surface">{mission.description}</p>
        <span className="mt-0.5 block font-mono text-label-small text-on-surface-variant">#{mission.id}</span>
      </div>
      <span className="font-mono text-label-large tabular-nums text-primary md:text-right">
        <span className="mr-2 font-sans text-label-small text-on-surface-variant md:hidden">{t(locale, "missions.columns.goal")}</span>
        {mission.goal.toLocaleString(locale)}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        {mission.rewards.length ? mission.rewards.map((reward, index) => <RewardChip key={`${reward.kind}:${reward.id}:${index}`} reward={reward} locale={locale} />) : <span className="text-body-small text-on-surface-variant">—</span>}
      </div>
    </li>
  );
}

function LimitedGroups({ locale, groups, servers, highlight }: { locale: AppLocale; groups: ServerFaceted<LimitedMissionGroupSummary>[]; servers: GameServer[]; highlight: string | null }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  if (!groups.length) return <p className="md3-surface p-8 text-center text-body-medium text-on-surface-variant">{t(locale, "missions.noLimited")}</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
      {groups.map((group) => {
        const highlighted = highlight === `limited-${group.id}`;
        return (
          <li key={group.id} id={`limited-${group.id}`} className="min-w-0 scroll-mt-28">
            <a
              href={localizePath(entityLinkPath({ routeId: "rewards", detailId: group.slug }), locale)}
              className={`mn-list-card group flex h-full min-w-0 flex-col overflow-hidden border bg-surface-container-low shadow-elevation-1 transition hover:shadow-elevation-1 ${highlighted ? "border-primary ring-2 ring-primary" : "border-outline-variant"}`}
              aria-current={highlighted ? "true" : undefined}
            >
              <div className="relative border-b border-outline-variant">
                <BannerImage src={group.bannerUrl} alt="" fallback={group.title} />
                <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
                  <ScheduleBadge locale={locale} startAt={group.startAt} endAt={group.endAt} now={now} />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
                <h3 className="line-clamp-2 text-label-large leading-5 text-on-surface group-hover:text-primary">{group.title}</h3>
                <p className="truncate text-body-small tabular-nums text-on-surface-variant">{formatScheduleRange(group.startAt, group.endAt, locale, timeZone) || t(locale, "rewards.alwaysOpen")}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-body-small text-on-surface-variant">
                  <span>{t(locale, "rewards.missionCount", { count: group.missionCount })}</span>
                  <ScheduleCountdown locale={locale} startAt={group.startAt} endAt={group.endAt} now={now} />
                  <ServerAvailabilityBadge locale={locale} entity={group} servers={servers} />
                </div>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

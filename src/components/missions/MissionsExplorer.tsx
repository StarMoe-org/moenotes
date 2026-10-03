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

interface Props {
  locale: AppLocale;
  categories: ServerFaceted<MissionCategoryViewModel>[];
  limitedGroups: ServerFaceted<LimitedMissionGroupSummary>[];
  servers: GameServer[];
}

/** A tab: one regular category (its MasterMission category id) or the limited groups. */
type Tab = number | "limited";

const tabClass = (active: boolean) => `mn-focus mn-stamp-press shrink-0 rounded-full border-[1.5px] px-4 py-2 text-xs font-bold transition sm:text-sm ${
  active
    ? "border-[var(--mn-accent-deep)] bg-[var(--mn-accent-deep)] text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]"
    : "border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] hover:border-[var(--mn-accent-deep)]/50"
}`;

/**
 * Regular missions by category, and the limited mission groups (each linking to its rewards page). `?mode=regular|limited&id=`
 * opens the tab holding that mission (or limited group), scrolls to it and highlights it.
 */
export default function MissionsExplorer({ locale, servers, categories: initialCategories, limitedGroups: initialGroups }: Props) {
  const { server, pickServer, items: categories } = useServerList(locale, servers, initialCategories);
  const groups = useMemo(() => initialGroups.filter((group) => group.servers.includes(server)), [initialGroups, server]);
  const [tab, setTab] = useState<Tab | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const pendingScroll = useRef<string | null>(null);

  // The deep link is read once in the browser; the static HTML shows the first tab.
  useEffect(() => {
    const { mode, id } = parseMissionsDeepLink(window.location.search);
    if (mode === "limited") {
      setTab("limited");
      const group = id === null ? undefined : groups.find((entry) => entry.id === id || entry.missionIds.includes(id));
      if (group) setHighlight(`limited-${group.id}`);
    } else if (mode === "regular" || id !== null) {
      const category = id === null ? undefined : categories.find((entry) => entry.missions.some((mission) => mission.id === id));
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

  const activeTab: Tab = tab ?? categories[0]?.id ?? "limited";
  const active = typeof activeTab === "number" ? categories.find((category) => category.id === activeTab) : undefined;

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
  }, [activeTab, highlight, categories, groups]);

  const pick = (next: Tab) => {
    setTab(next);
    setHighlight(null);
    replaceQueryParam("mode", next === "limited" ? "limited" : "regular");
    replaceQueryParam("id", null);
  };

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <nav aria-label={t(locale, "missions.tabs")} className="mn-scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {categories.map((category) => (
          <button key={category.id} type="button" onClick={() => pick(category.id)} aria-pressed={activeTab === category.id} className={tabClass(activeTab === category.id)}>
            {t(locale, `missions.categories.${missionCategoryKey(category.id)}`)}
            <span className="ml-1.5 font-mono text-[11px] opacity-70">{category.missions.length}</span>
          </button>
        ))}
        <button type="button" onClick={() => pick("limited")} aria-pressed={activeTab === "limited"} className={tabClass(activeTab === "limited")}>
          {t(locale, "missions.limited")}
          <span className="ml-1.5 font-mono text-[11px] opacity-70">{groups.length}</span>
        </button>
      </nav>

      <div className="mt-5" aria-live="polite">
        {activeTab === "limited" ? (
          <LimitedGroups locale={locale} groups={groups} servers={servers} highlight={highlight} />
        ) : active ? (
          <MissionList locale={locale} category={active} highlight={highlight} />
        ) : (
          <p className="mn-paper p-8 text-center text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "missions.empty")}</p>
        )}
      </div>
    </ServerScope>
  );
}

function MissionList({ locale, category, highlight }: { locale: AppLocale; category: MissionCategoryViewModel; highlight: string | null }) {
  if (!category.missions.length) return <p className="mn-paper p-8 text-center text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "missions.empty")}</p>;
  return (
    <div className="mn-paper overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_6rem_minmax(0,16rem)] gap-6 border-b border-[var(--mn-border)] px-6 py-3 text-xs font-bold text-[var(--mn-text-muted)] md:grid">
        <span>{t(locale, "missions.columns.mission")}</span>
        <span className="text-right">{t(locale, "missions.columns.goal")}</span>
        <span>{t(locale, "missions.columns.rewards")}</span>
      </div>
      <ol className="divide-y divide-dashed divide-[var(--mn-border)]/60">
        {category.missions.map((mission) => <MissionRow key={mission.id} locale={locale} mission={mission} highlighted={highlight === `mission-${mission.id}`} />)}
      </ol>
    </div>
  );
}

function MissionRow({ locale, mission, highlighted }: { locale: AppLocale; mission: RegularMissionViewModel; highlighted: boolean }) {
  return (
    <li
      id={`mission-${mission.id}`}
      className={`grid scroll-mt-28 gap-3 px-4 py-3.5 transition-colors sm:px-6 md:grid-cols-[minmax(0,1fr)_6rem_minmax(0,16rem)] md:items-center md:gap-6 ${highlighted ? "bg-[var(--mn-accent-soft)] ring-2 ring-inset ring-[var(--mn-accent)]" : ""}`}
      aria-current={highlighted ? "true" : undefined}
    >
      <div className="min-w-0">
        <p className="whitespace-pre-line text-sm font-medium leading-6 text-[var(--mn-text)]">{mission.description}</p>
        <span className="mt-0.5 block font-mono text-[11px] text-[var(--mn-text-muted)]">#{mission.id}</span>
      </div>
      <span className="font-mono text-sm font-black tabular-nums text-[var(--mn-accent-deep)] md:text-right">
        <span className="mr-2 font-sans text-[11px] font-bold text-[var(--mn-text-muted)] md:hidden">{t(locale, "missions.columns.goal")}</span>
        {mission.goal.toLocaleString(locale)}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        {mission.rewards.length ? mission.rewards.map((reward, index) => <RewardChip key={`${reward.kind}:${reward.id}:${index}`} reward={reward} locale={locale} />) : <span className="text-xs text-[var(--mn-text-muted)]">—</span>}
      </div>
    </li>
  );
}

function LimitedGroups({ locale, groups, servers, highlight }: { locale: AppLocale; groups: ServerFaceted<LimitedMissionGroupSummary>[]; servers: GameServer[]; highlight: string | null }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  if (!groups.length) return <p className="mn-paper p-8 text-center text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "missions.noLimited")}</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
      {groups.map((group) => {
        const highlighted = highlight === `limited-${group.id}`;
        return (
          <li key={group.id} id={`limited-${group.id}`} className="min-w-0 scroll-mt-28">
            <a
              href={localizePath(entityLinkPath({ routeId: "rewards", detailId: group.slug }), locale)}
              className={`mn-list-card group flex h-full min-w-0 flex-col overflow-hidden border-[1.5px] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)] ${highlighted ? "border-[var(--mn-accent)] ring-2 ring-[var(--mn-accent)]" : "border-[var(--mn-border)]"}`}
              aria-current={highlighted ? "true" : undefined}
            >
              <div className="relative border-b border-[var(--mn-glass-border)]">
                <BannerImage src={group.bannerUrl} alt="" fallback={group.title} />
                <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
                  <ScheduleBadge locale={locale} startAt={group.startAt} endAt={group.endAt} now={now} />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
                <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]">{group.title}</h3>
                <p className="truncate text-xs font-medium tabular-nums text-[var(--mn-text-muted)]">{formatScheduleRange(group.startAt, group.endAt, locale, timeZone) || t(locale, "rewards.alwaysOpen")}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-medium text-[var(--mn-text-muted)]">
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

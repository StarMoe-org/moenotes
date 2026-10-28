"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import DetailHero from "@/components/shared/DetailHero";
import { DetailRow } from "@/components/shared/DetailRows";
import ServerSchedules from "@/components/shared/ServerSchedules";
import TimesNote from "@/components/shared/TimesNote";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BannerImage from "@/components/shared/BannerImage";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import { rewardBannerCrop } from "@/components/rewards/RewardsExplorer";
import type { LoginBonusDetail, MissionGroupDetail, MissionViewModel, MonthlyPassDetail, RewardEntryDetail, SeasonPassDetail } from "@/lib/rewards/data";
import { getRoutePathById } from "@/lib/route/registry";
import { formatScheduleRange } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import SpoilerNotice from "@/components/shared/SpoilerNotice";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  entry: ServerFacetedValue<RewardEntryDetail> | null;
  servers: GameServer[];
}

const panelHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--md-ref-typeface-brand)] text-xl text-on-surface sm:text-2xl";

/** The entry as the page's server has it (docs/servers.md). */
export default function RewardDetail({ locale, entry: faceted, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const entry = useMemo(() => faceted && moveReleaseUrls(valueForServer(faceted, server), entityServer(faceted, server)), [faceted, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} hideSwitch>
      <RewardDetailView
        locale={locale}
        serverSwitch={serverSwitch}
        entry={entry}
        schedules={faceted && <ServerSchedules locale={locale} faceted={faceted} servers={servers} alwaysLabel={t(locale, "rewards.alwaysOpen")} />}
      />
    </ServerScope>
  );
}

function RewardDetailView({ locale, entry, serverSwitch, schedules }: { locale: AppLocale; serverSwitch: ReactNode; entry: RewardEntryDetail | null; schedules: ReactNode }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const { showSpoiler } = useSpoiler();
  const isUnreleased = Boolean(entry?.startAt && isSpoiler(entry.startAt, now));

  if (!entry) return <NotFound locale={locale} />;
  if (!showSpoiler && isUnreleased) return <SpoilerNotice locale={locale} />;

  const schedule = formatScheduleRange(entry.startAt, entry.endAt, locale, timeZone) || t(locale, "rewards.alwaysOpen");
  const facts: Array<[string, ReactNode]> = [
    [t(locale, "rewards.kind"), t(locale, `rewards.kinds.${entry.kind}`)],
    [t(locale, "rewards.period"), <span className="tabular-nums">{schedule}</span>],
    ...entryFacts(entry, locale),
  ];

  return (
    <div className="w-full space-y-8">
      <DetailHero title={entry.title} aside={serverSwitch} eyebrow={<ScheduleBadge locale={locale} startAt={entry.startAt} endAt={entry.endAt} now={now} />}>
        {(entry.kind === "seasonPass" || entry.kind === "monthlyPass") && entry.description && <p className="mt-1 max-w-[60ch] whitespace-pre-line text-body-large text-on-surface-variant">{entry.description}</p>}
      </DetailHero>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          <div className="md3-surface p-4">
            <BannerImage eager className="rounded-shape-md border border-outline-variant" src={entry.bannerUrl} alt={entry.title} fallback={entry.title} imageClassName={rewardBannerCrop(entry.kind)} />
          </div>
          <div className="md3-surface overflow-hidden">
            <dl className="divide-y divide-outline-variant px-6">
              {facts.map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}
            </dl>
            <TimesNote locale={locale} value={entry.startAt || entry.endAt} timeZone={timeZone} className="px-6 pb-5 text-body-small text-on-surface-variant" />
            <div className="px-6 pb-5 empty:hidden">{schedules}</div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          {entry.kind === "seasonPass" && <SeasonPassView entry={entry} locale={locale} />}
          {entry.kind === "loginBonus" && <LoginBonusView entry={entry} locale={locale} />}
          {entry.kind === "mission" && <MissionGroupView entry={entry} locale={locale} />}
          {entry.kind === "monthlyPass" && <MonthlyPassView entry={entry} locale={locale} />}
          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("rewards"), locale)} className="md3-button md3-button--tonal">
              {t(locale, "rewards.backToList")}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function entryFacts(entry: RewardEntryDetail, locale: AppLocale): Array<[string, ReactNode]> {
  if (entry.kind === "seasonPass") {
    const last = entry.levels[entry.levels.length - 1];
    return last ? [
      [t(locale, "rewards.maxLevel"), t(locale, "rewards.levelValue", { level: last.level })],
      [t(locale, "rewards.totalPoints"), <span className="font-mono tabular-nums">{last.point.toLocaleString(locale)}</span>],
    ] : [];
  }
  if (entry.kind === "loginBonus") {
    const days = entry.sheets.reduce((sum, sheet) => sum + sheet.days.length, 0);
    return [[t(locale, "rewards.dayCount"), t(locale, entry.isLoop ? "rewards.loopDays" : "rewards.days", { count: days })]];
  }
  if (entry.kind === "monthlyPass") {
    const yes = t(locale, "rewards.monthlyPass.yes");
    const no = t(locale, "rewards.monthlyPass.no");
    return [
      [t(locale, "rewards.monthlyPass.expireDays"), t(locale, "rewards.days", { count: entry.expireDays })],
      [t(locale, "rewards.monthlyPass.liveSkip"), entry.addLiveSkip > 0 ? t(locale, "rewards.monthlyPass.perDay", { count: entry.addLiveSkip }) : no],
      [t(locale, "rewards.monthlyPass.consumeAll"), entry.addConsumeAllUsageCount > 0 ? t(locale, "rewards.monthlyPass.perDay", { count: entry.addConsumeAllUsageCount }) : no],
      [t(locale, "rewards.monthlyPass.skipAd"), entry.canSkipAd ? yes : no],
    ];
  }
  const missions = entry.days.reduce((sum, day) => sum + day.missions.length, 0);
  return [[t(locale, "rewards.missions"), t(locale, "rewards.missionCount", { count: missions })]];
}

function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="md3-surface overflow-hidden">
      <div className={panelHeader}><h3 className={panelTitle}>{title}</h3>{actions}</div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

function Segmented<T extends string | number>({ label, options, value, onChange, format }: { label: string; options: T[]; value: T; onChange: (value: T) => void; format: (value: T) => string }) {
  return (
    <div className="md3-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className="md3-segment md3-state"
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}

function RewardList({ rewards, locale }: { rewards: MissionViewModel["rewards"]; locale: AppLocale }) {
  if (rewards.length === 0) return <span className="text-body-small text-on-surface-variant">—</span>;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {rewards.map((reward, index) => <RewardChip key={`${reward.kind}:${reward.id}:${index}`} reward={reward} locale={locale} />)}
    </div>
  );
}

function SeasonPassView({ entry, locale }: { entry: SeasonPassDetail; locale: AppLocale }) {
  const categories = entry.missionGroups.map((group) => group.category);
  const [category, setCategory] = useState(categories[0] ?? "daily");
  const missions = entry.missionGroups.find((group) => group.category === category)?.missions ?? [];

  return (
    <>
      <Panel title={t(locale, "rewards.levelRewards")}>
        <div className="hidden grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-outline-variant px-3 pb-2 text-label-medium text-on-surface-variant md:grid">
          <span>{t(locale, "rewards.level")}</span>
          <span>{t(locale, "rewards.free")}</span>
          <span className="text-primary">{t(locale, "rewards.premium")}</span>
        </div>
        <ol className="divide-y divide-dashed divide-outline-variant/60">
          {entry.levels.map((level) => (
            <li key={level.level} className={`grid gap-3 px-3 py-3 md:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-4 ${level.featured ? "rounded-shape-md bg-secondary-container" : ""}`}>
              <div className="flex items-baseline gap-2 md:flex-col md:gap-0.5">
                <span className="font-mono text-title-medium tabular-nums text-on-surface">{t(locale, "rewards.levelValue", { level: level.level })}</span>
                <span className="font-mono text-label-small tabular-nums text-on-surface-variant">{t(locale, "rewards.points", { count: level.point.toLocaleString(locale) })}</span>
                {level.featured && <span className="text-label-small text-primary">{t(locale, "rewards.featured")}</span>}
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-label-small text-on-surface-variant md:hidden">{t(locale, "rewards.free")}</span>
                <RewardList rewards={level.free} locale={locale} />
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-label-small text-primary md:hidden">{t(locale, "rewards.premium")}</span>
                <RewardList rewards={level.premium} locale={locale} />
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      {entry.missionGroups.length > 0 && (
        <Panel
          title={t(locale, "rewards.missions")}
          actions={categories.length > 1 && (
            <Segmented label={t(locale, "rewards.missionCategory")} options={categories} value={category} onChange={setCategory} format={(value) => t(locale, `rewards.missionCategories.${value}`)} />
          )}
        >
          <MissionList missions={missions} locale={locale} />
        </Panel>
      )}
    </>
  );
}

function MissionList({ missions, locale }: { missions: MissionViewModel[]; locale: AppLocale }) {
  return (
    <ol className="divide-y divide-dashed divide-outline-variant/60">
      {missions.map((mission) => (
        <li key={mission.id} className="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center sm:gap-6">
          <p className="min-w-0 whitespace-pre-line text-body-medium leading-6 text-on-surface">{mission.description}</p>
          <div className="min-w-0 sm:justify-self-end">
            {mission.points > 0
              ? <span className="inline-flex rounded-full border border-primary/45 bg-secondary-container px-2.5 py-1 font-mono text-label-medium tabular-nums text-primary">{t(locale, "rewards.missionPoints", { count: mission.points })}</span>
              : <RewardList rewards={mission.rewards} locale={locale} />}
          </div>
        </li>
      ))}
    </ol>
  );
}

function LoginBonusView({ entry, locale }: { entry: LoginBonusDetail; locale: AppLocale }) {
  return (
    <>
      {entry.sheets.map((sheet) => (
        <Panel key={sheet.sheet} title={entry.sheets.length > 1 ? t(locale, "rewards.sheet", { sheet: sheet.sheet }) : t(locale, "rewards.dailyRewards")}>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {sheet.days.map((day) => (
              <li key={day.day} className={`mn-list-card-row flex min-w-0 flex-col gap-2.5 border p-3 ${day.decorated ? "border-primary bg-secondary-container" : "border-outline-variant bg-surface-container"}`}>
                <span className={`text-label-medium ${day.decorated ? "text-primary" : "text-on-surface-variant"}`}>{t(locale, "rewards.day", { day: day.day })}</span>
                <RewardList rewards={day.rewards} locale={locale} />
              </li>
            ))}
          </ol>
        </Panel>
      ))}
    </>
  );
}

function MissionGroupView({ entry, locale }: { entry: MissionGroupDetail; locale: AppLocale }) {
  const days = entry.days.map((day) => day.day);
  const [day, setDay] = useState(days[0] ?? 1);
  const missions = entry.days.find((item) => item.day === day)?.missions ?? [];

  return (
    <>
      <Panel
        title={t(locale, "rewards.missions")}
        actions={days.length > 1 && <Segmented label={t(locale, "rewards.dayTabs")} options={days} value={day} onChange={setDay} format={(value) => t(locale, "rewards.day", { day: value })} />}
      >
        <MissionList missions={missions} locale={locale} />
      </Panel>
      {entry.completeRewards.length > 0 && (
        <Panel title={t(locale, "rewards.completeRewards")}>
          <RewardList rewards={entry.completeRewards} locale={locale} />
        </Panel>
      )}
    </>
  );
}

/** Days that hand out the same rewards as the day before fold into one range ("Day 1–30"). */
function foldDays(days: MonthlyPassDetail["dailyRewards"]): Array<{ from: number; to: number; rewards: MonthlyPassDetail["dailyRewards"][number]["rewards"] }> {
  const ranges: Array<{ from: number; to: number; rewards: MonthlyPassDetail["dailyRewards"][number]["rewards"]; key: string }> = [];
  for (const day of days) {
    const key = JSON.stringify(day.rewards.map((reward) => [reward.kind, reward.id, reward.count]));
    const last = ranges[ranges.length - 1];
    if (last && last.key === key && last.to === day.day - 1) last.to = day.day;
    else ranges.push({ from: day.day, to: day.day, rewards: day.rewards, key });
  }
  return ranges.map(({ from, to, rewards }) => ({ from, to, rewards }));
}

function MonthlyPassView({ entry, locale }: { entry: MonthlyPassDetail; locale: AppLocale }) {
  const ranges = foldDays(entry.dailyRewards);
  return (
    <>
      {entry.firstTimeRewards.length > 0 && (
        <Panel title={t(locale, "rewards.monthlyPass.firstTime")}>
          <RewardList rewards={entry.firstTimeRewards} locale={locale} />
        </Panel>
      )}
      {ranges.length > 0 && (
        <Panel title={t(locale, "rewards.dailyRewards")}>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {ranges.map((range) => (
              <li key={range.from} className="mn-list-card-row flex min-w-0 flex-col gap-2.5 border border-outline-variant bg-surface-container p-3">
                <span className="text-label-medium text-on-surface-variant">
                  {range.from === range.to ? t(locale, "rewards.day", { day: range.from }) : t(locale, "rewards.monthlyPass.dayRange", { from: range.from, to: range.to })}
                </span>
                <RewardList rewards={range.rewards} locale={locale} />
              </li>
            ))}
          </ol>
        </Panel>
      )}
      {entry.continuationRewards.length > 0 && (
        <Panel title={t(locale, "rewards.monthlyPass.continuation")}>
          <ol className="divide-y divide-dashed divide-outline-variant/60">
            {entry.continuationRewards.map((step) => (
              <li key={step.purchaseCount} className="grid gap-3 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
                <span className="text-label-large text-on-surface">{t(locale, "rewards.monthlyPass.purchase", { count: step.purchaseCount })}</span>
                <RewardList rewards={step.rewards} locale={locale} />
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </>
  );
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="md3-surface p-8 text-center sm:p-12">
      <h1 className="text-headline-small text-on-surface">{t(locale, "rewards.notFoundTitle")}</h1>
      <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "rewards.notFoundDescription")}</p>
      <a href={localizePath(getRoutePathById("rewards"), locale)} className="md3-button md3-button--tonal mt-6">
        {t(locale, "rewards.backToList")}
      </a>
    </div>
  );
}

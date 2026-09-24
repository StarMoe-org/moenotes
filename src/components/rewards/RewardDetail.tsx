import { useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BannerImage from "@/components/shared/BannerImage";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import { rewardBannerCrop } from "@/components/rewards/RewardsExplorer";
import type { LoginBonusDetail, MissionGroupDetail, MissionViewModel, RewardEntryDetail, SeasonPassDetail } from "@/lib/rewards/data";
import { getRoutePathById } from "@/lib/route/registry";
import { formatScheduleRange } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";

interface Props {
  locale: AppLocale;
  entry: RewardEntryDetail | null;
}

const panelHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl";

export default function RewardDetail({ locale, entry }: Props) {
  const now = useNow();
  if (!entry) return <NotFound locale={locale} />;

  const schedule = formatScheduleRange(entry.startAt, entry.endAt, locale) || t(locale, "rewards.alwaysOpen");
  const facts: Array<[string, ReactNode]> = [
    [t(locale, "rewards.kind"), t(locale, `rewards.kinds.${entry.kind}`)],
    [t(locale, "rewards.period"), <span className="tabular-nums">{schedule}</span>],
    ...entryFacts(entry, locale),
  ];

  return (
    <div className="w-full space-y-8">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-4 shadow-[var(--mn-shadow-stamp-lg)]">
            <BannerImage eager className="rounded-xl border border-[var(--mn-glass-border)]" src={entry.bannerUrl} alt={entry.title} fallback={entry.title} imageClassName={rewardBannerCrop(entry.kind)} />
          </div>
          <div className="mn-paper overflow-hidden">
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent p-6">
              <ScheduleBadge locale={locale} startAt={entry.startAt} endAt={entry.endAt} now={now} />
              <h2 className="mt-3 font-[var(--mn-font-display)] text-2xl leading-tight text-[var(--mn-text)] sm:text-3xl">{entry.title}</h2>
              {entry.kind === "seasonPass" && entry.description && <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[var(--mn-text-muted)]">{entry.description}</p>}
            </div>
            <div className="divide-y divide-dashed divide-[var(--mn-border)]/60 px-6 py-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <span className="shrink-0 font-semibold text-[var(--mn-text-muted)]">{label}</span>
                  <span className="min-w-0 text-right font-semibold text-[var(--mn-text)]">{value}</span>
                </div>
              ))}
            </div>
            <p className="px-6 pb-5 text-xs text-[var(--mn-text-muted)]">{t(locale, "gacha.timezone")}</p>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          {entry.kind === "seasonPass" && <SeasonPassView entry={entry} locale={locale} />}
          {entry.kind === "loginBonus" && <LoginBonusView entry={entry} locale={locale} />}
          {entry.kind === "mission" && <MissionGroupView entry={entry} locale={locale} />}
          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("rewards"), locale)} className="mn-focus mn-stamp-press inline-flex rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
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
  const missions = entry.days.reduce((sum, day) => sum + day.missions.length, 0);
  return [[t(locale, "rewards.missions"), t(locale, "rewards.missionCount", { count: missions })]];
}

function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mn-paper overflow-hidden">
      <div className={panelHeader}><h3 className={panelTitle}>{title}</h3>{actions}</div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

function Segmented<T extends string | number>({ label, options, value, onChange, format }: { label: string; options: T[]; value: T; onChange: (value: T) => void; format: (value: T) => string }) {
  return (
    <div className="mn-segmented flex max-w-full flex-wrap gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`mn-focus rounded-full px-3 py-1 text-xs font-bold transition ${value === option ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}

function RewardList({ rewards, locale }: { rewards: MissionViewModel["rewards"]; locale: AppLocale }) {
  if (rewards.length === 0) return <span className="text-xs text-[var(--mn-text-muted)]">—</span>;
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
        <div className="hidden grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-[var(--mn-glass-border)] px-3 pb-2 text-xs font-bold text-[var(--mn-text-muted)] md:grid">
          <span>{t(locale, "rewards.level")}</span>
          <span>{t(locale, "rewards.free")}</span>
          <span className="text-[var(--mn-accent-deep)]">{t(locale, "rewards.premium")}</span>
        </div>
        <ol className="divide-y divide-dashed divide-[var(--mn-border)]/60">
          {entry.levels.map((level) => (
            <li key={level.level} className={`grid gap-3 px-3 py-3 md:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-4 ${level.featured ? "rounded-xl bg-[var(--mn-accent-soft)]" : ""}`}>
              <div className="flex items-baseline gap-2 md:flex-col md:gap-0.5">
                <span className="font-mono text-base font-black tabular-nums text-[var(--mn-text)]">{t(locale, "rewards.levelValue", { level: level.level })}</span>
                <span className="font-mono text-[11px] tabular-nums text-[var(--mn-text-muted)]">{t(locale, "rewards.points", { count: level.point.toLocaleString(locale) })}</span>
                {level.featured && <span className="text-[11px] font-bold text-[var(--mn-accent-deep)]">{t(locale, "rewards.featured")}</span>}
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-[11px] font-bold text-[var(--mn-text-muted)] md:hidden">{t(locale, "rewards.free")}</span>
                <RewardList rewards={level.free} locale={locale} />
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-[11px] font-bold text-[var(--mn-accent-deep)] md:hidden">{t(locale, "rewards.premium")}</span>
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
    <ol className="divide-y divide-dashed divide-[var(--mn-border)]/60">
      {missions.map((mission) => (
        <li key={mission.id} className="grid gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center sm:gap-6">
          <p className="min-w-0 whitespace-pre-line text-sm font-medium leading-6 text-[var(--mn-text)]">{mission.description}</p>
          <div className="min-w-0 sm:justify-self-end">
            {mission.points > 0
              ? <span className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--mn-accent)_45%,transparent)] bg-[var(--mn-accent-soft)] px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-[var(--mn-accent-deep)]">{t(locale, "rewards.missionPoints", { count: mission.points })}</span>
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
              <li key={day.day} className={`mn-list-card-row flex min-w-0 flex-col gap-2.5 border p-3 ${day.decorated ? "border-[var(--mn-accent)] bg-[var(--mn-accent-soft)]" : "border-[var(--mn-glass-border)] bg-[var(--mn-surface)]"}`}>
                <span className={`text-xs font-black ${day.decorated ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)]"}`}>{t(locale, "rewards.day", { day: day.day })}</span>
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

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "rewards.notFoundTitle")}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "rewards.notFoundDescription")}</p>
      <a href={localizePath(getRoutePathById("rewards"), locale)} className="mn-focus mn-stamp-press mt-6 inline-flex rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "rewards.backToList")}
      </a>
    </div>
  );
}

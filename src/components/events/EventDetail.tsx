import { useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import ToggleButton from "@mui/material/ToggleButton";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import MemberCardItem from "@/components/cards/MemberCardItem";
import EventBanner, { EventScene } from "@/components/events/EventBanner";
import BandLogo from "@/components/shared/BandLogo";
import BannerImage from "@/components/shared/BannerImage";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ServerSchedules from "@/components/shared/ServerSchedules";
import TimesNote from "@/components/shared/TimesNote";
import ServerScope from "@/components/shared/ServerScope";
import SupportCardItem from "@/components/support-cards/SupportCardItem";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { moveReleaseUrls } from "@/lib/assets/release";
import type { EventBonus, EventBonusGroup, EventBonusTarget, EventBoxGachaBox, EventBoxGachaItem, EventChallengeLive, EventDetailViewModel, EventLiveRow, EventMissionRow, EventRankingTier, EventRelatedGacha, EventStoryEpisode } from "@/lib/events/data";
import { getImageAssetUrl } from "@/lib/assets/url";
import { formatCompactCount } from "@/lib/format/compact-count";
import { getEventTrackerHref } from "@/lib/game-api/links";
import type { MusicViewModel } from "@/lib/music/data";
import { entityLinkPath } from "@/lib/route/entity-link";
import { getRoutePathById } from "@/lib/route/registry";
import { formatMasterDate, formatScheduleRange } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  event: ServerFacetedValue<EventDetailViewModel> | null;
  servers: GameServer[];
}

const CARD_RANKS = [1, 2, 3, 4, 5];

/** The event as the page's server has it (docs/servers.md). */
export default function EventDetail({ locale, event: faceted, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const event = useMemo(() => faceted && moveReleaseUrls(valueForServer(faceted, server), entityServer(faceted, server)), [faceted, server]);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []}>
      <EventDetailView locale={locale} server={server} event={event} schedules={faceted && <ServerSchedules locale={locale} faceted={faceted} servers={servers} alwaysLabel="" />} />
    </ServerScope>
  );
}

function EventDetailView({ locale, server, event, schedules }: { locale: AppLocale; server: GameServer; event: EventDetailViewModel | null; schedules: ReactNode }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  if (!event) return <NotFound locale={locale} />;

  const alt = t(locale, "events.bannerAlt", { name: event.name });
  const rankings = (["score", "music", "totalMusic"] as const).filter((kind) => event.rankings[kind]);
  const facts: Array<[string, ReactNode]> = [
    [t(locale, "events.period"), <span className="tabular-nums">{formatScheduleRange(event.startAt, event.endAt, locale, timeZone)}</span>],
    ...(event.displayEndAt ? [[t(locale, "events.displayUntil"), <span className="tabular-nums">{formatMasterDate(event.displayEndAt, locale, true, timeZone)}</span>] as [string, ReactNode]] : []),
    [t(locale, "events.rankings"), rankings.length ? rankings.map((kind) => t(locale, `events.rankingKinds.${kind}`)).join(" · ") : t(locale, "events.rankingOff")],
    [t(locale, "events.eventId"), `#${event.id}`],
  ];

  return (
    <MdMuiProvider>
    <div className="w-full space-y-8">
      <div className="overflow-hidden rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
        {event.backgroundUrl
          ? <EventScene event={event} alt={alt} eager className="aspect-[4/3] sm:aspect-[16/9] xl:aspect-[5/2]" />
          : <EventBanner event={event} alt={alt} eager />}
      </div>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          <Card variant="outlined" sx={{ overflow: "hidden" }}>
            <div className="border-b border-[var(--md-sys-color-outline-variant)] bg-gradient-to-r from-[color-mix(in_oklab,var(--md-sys-color-primary)_6%,transparent)] to-transparent p-6">
              <ScheduleBadge locale={locale} startAt={event.startAt} endAt={event.endAt} now={now} />
              <Typography component="h2" sx={{ mt: 1.5, fontFamily: "var(--mn-font-display)", fontSize: { xs: 24, sm: 30 }, lineHeight: 1.25, color: "var(--md-sys-color-on-surface)" }}>{event.name}</Typography>
              <ScheduleCountdown locale={locale} startAt={event.startAt} endAt={event.endAt} now={now} className="mt-2" />
              {event.chapterDescription && <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-[var(--md-sys-color-on-surface-variant)]">{event.chapterDescription}</p>}
            </div>
            <div className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/60 px-6 py-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <span className="shrink-0 font-semibold text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
                  <span className="min-w-0 text-right font-semibold text-[var(--md-sys-color-on-surface)]">{value}</span>
                </div>
              ))}
              {event.eventItem && (
                <div className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <span className="shrink-0 font-semibold text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.eventItem")}</span>
                  <RewardChip reward={event.eventItem} locale={locale} />
                </div>
              )}
            </div>
            {rankings.length > 0 && (
              <div className="px-6 pb-4">
                <Button component="a" size="small" variant="outlined" href={getEventTrackerHref(locale, { server, event: String(event.id) })}>
                  {t(locale, "eventTracker.openTracker")}
                </Button>
              </div>
            )}
            <TimesNote locale={locale} value={event.startAt || event.endAt} timeZone={timeZone} className="px-6 pb-5 text-xs text-[var(--md-sys-color-on-surface-variant)]" />
            <div className="px-6 pb-5 empty:hidden">{schedules}</div>
          </Card>
          {event.music && <SongPanel locale={locale} song={event.music} />}
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          {event.bonusGroups.length > 0 && <BonusPanel locale={locale} groups={event.bonusGroups} />}

          {event.cards.length + event.supportCards.length > 0 && (
            <Panel title={t(locale, "events.cards")}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-4">
                {event.cards.map((card) => <MemberCardItem key={`m${card.id}`} card={card} locale={locale} />)}
                {event.supportCards.map((card) => <SupportCardItem key={`s${card.id}`} card={card} locale={locale} />)}
              </div>
            </Panel>
          )}

          {event.relatedGachas.length > 0 && <RelatedGachaPanel locale={locale} gachas={event.relatedGachas} now={now} />}

          {event.story.length > 0 && <StoryPanel locale={locale} event={event} />}
          {event.missions.length > 0 && <MissionsPanel locale={locale} missions={event.missions} />}
          {event.pointRewards.length > 0 && <PointRewardsPanel locale={locale} event={event} />}
          {event.boxGacha && <BoxGachaPanel locale={locale} boxGacha={event.boxGacha} />}
          {event.rankingRewards.length > 0 && <RankingRewardsPanel locale={locale} tiers={event.rankingRewards} />}
          {event.challengeMusic && <ChallengeMusicPanel locale={locale} detail={event.challengeMusic} />}
          {event.live.length + event.challengeLive.length > 0 && <LiveRewardsPanel locale={locale} event={event} />}

          <div className="flex justify-start">
            <Button component="a" href={localizePath(getRoutePathById("event-list"), locale)} variant="outlined">
              {t(locale, "events.backToList")}
            </Button>
          </div>
        </section>
      </div>
    </div>
    </MdMuiProvider>
  );
}

/** Gachas featuring the event's cards: the event's own cards and the cards its bonus names, among their rate-up prizes. */
function RelatedGachaPanel({ locale, gachas, now }: { locale: AppLocale; gachas: EventRelatedGacha[]; now: number | null }) {
  return (
    <Panel title={t(locale, "events.relatedGacha")}>
      <p className="mb-4 text-xs leading-6 text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.relatedGachaNote")}</p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {gachas.map((gacha) => (
          <li key={gacha.id} className="min-w-0">
            <a
              href={localizePath(entityLinkPath({ routeId: "gacha", detailId: gacha.id }), locale)}
              className="group flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border-[1.5px] border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] transition-colors hover:border-[var(--md-sys-color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]"
            >
              <BannerImage src={getImageAssetUrl(gacha.bannerPath, locale)} alt="" fallback={gacha.name} />
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <span className="line-clamp-2 text-sm font-black leading-5 text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)]">{gacha.name}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <ScheduleBadge locale={locale} startAt={gacha.startAt} endAt={gacha.endAt} now={now} countdown={false} />
                  <ScheduleCountdown locale={locale} startAt={gacha.startAt} endAt={gacha.endAt} now={now} />
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ overflow: "hidden" }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5, borderBottom: "1px solid var(--md-sys-color-outline-variant)", px: 3, py: 2 }}>
        <Typography component="h3" sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 20, sm: 24 }, color: "var(--md-sys-color-on-surface)" }}>
          {title}
        </Typography>
        {actions}
      </Box>
      <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>
    </Card>
  );
}

const segmentedSx: SxProps<Theme> = {
  borderRadius: 999,
  textTransform: "none",
  fontSize: 12,
  fontWeight: 700,
  px: 1.5,
  py: 0.5,
  border: "1px solid var(--md-sys-color-outline-variant)",
  color: "var(--md-sys-color-on-surface-variant)",
  "&.Mui-selected": {
    bgcolor: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
  },
  "&.Mui-selected:hover": {
    bgcolor: "var(--md-sys-color-secondary-container)",
  },
};

function Segmented<T extends string | number>({ label, options, value, onChange, format }: { label: string; options: T[]; value: T; onChange: (value: T) => void; format: (value: T) => string }) {
  return (
    <Box role="group" aria-label={label} sx={{ display: "flex", maxWidth: "100%", flexWrap: "wrap", gap: 0.5 }}>
      {options.map((option) => (
        <ToggleButton
          key={option}
          value={option}
          selected={value === option}
          onChange={() => onChange(option)}
          sx={segmentedSx}
        >
          {format(option)}
        </ToggleButton>
      ))}
    </Box>
  );
}

function SongPanel({ locale, song }: { locale: AppLocale; song: MusicViewModel }) {
  const assetUrl = useAssetUrl();
  return (
    <Card variant="outlined" sx={{ overflow: "hidden" }}>
      <Box sx={{ borderBottom: "1px solid var(--md-sys-color-outline-variant)", px: 3, py: 2 }}>
        <Typography component="h3" sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 20, sm: 24 }, color: "var(--md-sys-color-on-surface)" }}>
          {t(locale, "events.song")}
        </Typography>
      </Box>
      <a href={localizePath(`${getRoutePathById("music")}/${song.id}`, locale)} className="group flex items-center gap-4 p-4 sm:p-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]">
        <img className="h-16 w-16 shrink-0 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] object-cover" src={assetUrl(song.jacketUrl)} alt="" loading="lazy" />
        <span className="min-w-0">
          <span className="block truncate text-base font-black text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)]">{song.title}</span>
          {song.bandName && <span className="mt-0.5 block truncate text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">{song.bandName}</span>}
        </span>
      </a>
    </Card>
  );
}

function BonusPanel({ locale, groups }: { locale: AppLocale; groups: EventBonusGroup[] }) {
  const [rank, setRank] = useState(CARD_RANKS[0]!);
  const percent = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);
  const value = (values: number[] | null) => {
    const current = values?.[rank - 1];
    return current === undefined ? <span className="text-[var(--md-sys-color-on-surface-variant)]">—</span> : t(locale, "events.bonusValue", { value: percent.format(current) });
  };

  return (
    <Panel
      title={t(locale, "events.bonus")}
      actions={<Segmented label={t(locale, "events.bonusRankLabel")} options={CARD_RANKS} value={rank} onChange={setRank} format={(option) => t(locale, "events.bonusRank", { rank: option })} />}
    >
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.cardKind} className="min-w-0">
            <h4 className="mb-2 text-sm font-black text-[var(--md-sys-color-primary)]">{t(locale, `events.bonusCardKinds.${group.cardKind}`)}</h4>
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-left text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
                  <th className="py-2 pr-3 font-bold">{t(locale, "events.bonusTarget")}</th>
                  <th className="w-24 py-2 text-right font-bold sm:w-28">{t(locale, "events.bonusParameter")}</th>
                  <th className="w-24 py-2 text-right font-bold sm:w-28">{t(locale, "events.bonusEventItem")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/60">
                {group.bonuses.map((bonus) => (
                  <tr key={bonusKey(bonus)}>
                    <td className="py-2.5 pr-3"><BonusTargetLabel locale={locale} target={bonus.target} /></td>
                    <td className="py-2.5 text-right font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">{value(bonus.parameter)}</td>
                    <td className="py-2.5 text-right font-bold tabular-nums text-[var(--md-sys-color-primary)]">{value(bonus.eventItem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <p className="border-t border-[var(--md-sys-color-outline-variant)] pt-3 text-xs leading-6 text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.bonusNote")}</p>
      </div>
    </Panel>
  );
}

function bonusKey({ target }: EventBonus): string {
  return `${target.kind}:${target.id}`;
}

function BonusTargetLabel({ locale, target }: { locale: AppLocale; target: EventBonusTarget }) {
  const assetUrl = useAssetUrl();
  const [failed, setFailed] = useState(false);
  const name = target.kind === "attribute"
    ? t(locale, "events.bonusTargets.attribute", { name: t(locale, `cards.attributes.${target.id}`) })
    : target.kind === "tag"
      ? t(locale, "events.bonusTargets.tag", { id: target.id })
      : target.kind === "any"
        ? t(locale, "events.bonusTargets.any")
        : target.name || `#${target.id}`;

  let icon: ReactNode = null;
  if (target.kind === "band") {
    icon = <BandLogo bandId={target.id} bandName={name} locale={locale} />;
  } else if (target.imageUrl && !failed) {
    const round = target.kind === "character";
    const small = target.kind === "attribute";
    icon = (
      <img
        className={`shrink-0 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] object-cover ${small ? "h-6 w-6 rounded-full border-0 bg-transparent object-contain" : round ? "h-9 w-9 rounded-full" : "h-10 w-10 rounded-xl"}`}
        src={assetUrl(target.imageUrl)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  const content = (
    <>
      {icon}
      <span className="min-w-0 truncate font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)]">{name}</span>
    </>
  );
  const href = target.link ? localizePath(entityLinkPath(target.link), locale) : null;
  const className = "flex min-w-0 items-center gap-2.5";
  return href
    ? <a href={href} className={`group ${className} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]`}>{content}</a>
    : <span className={className}>{content}</span>;
}

function episodeLabel(locale: AppLocale, episode: EventStoryEpisode): string {
  if (episode.episodeNumber === null) return "";
  const key = episode.kind === "another" ? "story.ui.anotherEpisode" : episode.kind === "extra" ? "story.ui.extraEpisode" : "story.ui.episode";
  return t(locale, key, { n: episode.episodeNumber });
}

function StoryPanel({ locale, event }: { locale: AppLocale; event: EventDetailViewModel }) {
  const assetUrl = useAssetUrl();
  return (
    <Panel title={t(locale, "events.story")}>
      {event.chapterDescription && <p className="mb-4 whitespace-pre-line text-sm leading-7 text-[var(--md-sys-color-on-surface-variant)]">{event.chapterDescription}</p>}
      <ol className="grid gap-3 sm:grid-cols-2">
        {event.story.map((episode) => (
          <li key={episode.advId} className="min-w-0">
            <a
              href={localizePath(`${getRoutePathById("story")}/${episode.advId}`, locale)}
              className="group flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] p-2.5 transition-colors hover:border-[var(--md-sys-color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]"
            >
              {episode.imageUrl
                ? <img src={assetUrl(episode.imageUrl)} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" loading="lazy" />
                : <span className="mn-texture-orbit h-14 w-24 shrink-0 rounded-lg" aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block text-[11px] font-black tracking-wider text-[var(--md-sys-color-primary)]">{episodeLabel(locale, episode)}</span>
                <span className="block truncate text-sm font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)]">{episode.title}</span>
                {episode.eventPoint > 0 && <span className="block text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.storyUnlock", { count: episode.eventPoint.toLocaleString(locale) })}</span>}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function PointRewardsPanel({ locale, event }: { locale: AppLocale; event: EventDetailViewModel }) {
  const loop = event.loopReward;
  return (
    <Panel title={t(locale, "events.pointRewards")}>
      <ol className="grid gap-x-6 sm:grid-cols-2 2xl:grid-cols-3">
        {event.pointRewards.map((tier, index) => (
          <li key={`${tier.point}:${index}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-dashed border-[var(--md-sys-color-outline-variant)]/60 py-2.5">
            <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">{t(locale, "events.points", { count: tier.point.toLocaleString(locale) })}</span>
            <span className="flex min-w-0 flex-wrap justify-end gap-2">
              {tier.rewards.map((reward, rewardIndex) => <RewardChip key={`${reward.kind}:${reward.id}:${rewardIndex}`} reward={reward} locale={locale} variant="icon" />)}
            </span>
          </li>
        ))}
      </ol>
      {loop && loop.rewards.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--md-sys-color-secondary-container)] px-3 py-2.5">
          <span className="text-sm font-bold text-[var(--md-sys-color-on-secondary-container)]">{t(locale, "events.loopReward", { from: loop.from.toLocaleString(locale), every: loop.every.toLocaleString(locale) })}</span>
          <span className="flex flex-wrap gap-2">
            {loop.rewards.map((reward, index) => <RewardChip key={`${reward.kind}:${reward.id}:${index}`} reward={reward} locale={locale} variant="icon" />)}
          </span>
        </div>
      )}
    </Panel>
  );
}

function LiveRewardsPanel({ locale, event }: { locale: AppLocale; event: EventDetailViewModel }) {
  const kinds = ([["live", event.live], ["challenge", event.challengeLive]] as const).filter(([, rows]) => rows.length > 0);
  return (
    <Panel title={t(locale, "events.liveRewards")}>
      <div className="grid gap-6 xl:grid-cols-2">
        {kinds.map(([kind, rows]) => (
          <section key={kind} className="min-w-0">
            <h4 className="mb-2 text-sm font-black text-[var(--md-sys-color-primary)]">{t(locale, `events.liveKinds.${kind}`)}</h4>
            <LiveTable locale={locale} rows={rows} />
          </section>
        ))}
      </div>
      <p className="mt-4 border-t border-[var(--md-sys-color-outline-variant)] pt-3 text-xs leading-6 text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.liveNote")}</p>
    </Panel>
  );
}

function MissionsPanel({ locale, missions }: { locale: AppLocale; missions: EventMissionRow[] }) {
  return (
    <Panel title={t(locale, "events.missions")}>
      <ol className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/60">
        {missions.map((mission) => (
          <li key={mission.id} className="flex min-w-0 items-center justify-between gap-4 py-3">
            <span className="min-w-0 flex-1 text-sm font-bold leading-6 text-[var(--md-sys-color-on-surface)]">{mission.description || `#${mission.id}`}</span>
            <span className="flex shrink-0 flex-wrap justify-end gap-2">
              {mission.rewards.map((reward, index) => <RewardChip key={`${reward.kind}:${reward.id}:${index}`} reward={reward} locale={locale} variant="icon" />)}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function BoxGachaPanel({ locale, boxGacha }: { locale: AppLocale; boxGacha: NonNullable<EventDetailViewModel["boxGacha"]> }) {
  return (
    <Panel title={t(locale, "events.boxGacha")}>
      <div className="space-y-6">
        {boxGacha.item && (
          <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.boxGachaCost", { count: boxGacha.item.count.toLocaleString(locale) })}</p>
        )}
        {boxGacha.boxes.map((box) => (
          <section key={box.tier} className="min-w-0">
            <h4 className="mb-2 flex items-center justify-between gap-3 text-sm font-black text-[var(--md-sys-color-primary)]">
              <span>{t(locale, "events.boxGachaBox", { n: box.tier })}</span>
              <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.boxGachaCost", { count: box.cost.toLocaleString(locale) })}</span>
            </h4>
            <BoxGachaTable locale={locale} items={box.items} />
          </section>
        ))}
        {boxGacha.loop && (
          <section className="min-w-0">
            <h4 className="mb-2 text-sm font-black text-[var(--md-sys-color-primary)]">{t(locale, "events.boxGachaLoop", { n: boxGacha.loop.tier })}</h4>
            <BoxGachaTable locale={locale} items={boxGacha.loop.items} />
          </section>
        )}
        <p className="border-t border-[var(--md-sys-color-outline-variant)] pt-3 text-xs leading-6 text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.boxGachaNote")}</p>
      </div>
    </Panel>
  );
}

function BoxGachaTable({ locale, items }: { locale: AppLocale; items: EventBoxGachaItem[] }) {
  return (
    <ol className="grid gap-x-6 sm:grid-cols-2">
      {items.map((item, index) => (
        <li key={`${item.kind}:${item.id}:${index}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-dashed border-[var(--md-sys-color-outline-variant)]/60 py-2">
          <span className="flex min-w-0 flex-1 items-center"><RewardChip reward={item} locale={locale} variant="icon" /></span>
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            {t(locale, "events.boxGachaCount", { count: formatCompactCount(item.count) })}
            {item.probability < 100 && <span className="ml-2">{t(locale, "events.probability", { rate: item.probability })}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function RankingRewardsPanel({ locale, tiers }: { locale: AppLocale; tiers: EventRankingTier[] }) {
  return (
    <Panel title={t(locale, "events.rankingRewards")}>
      <ol className="grid gap-x-6 sm:grid-cols-2">
        {tiers.map((tier, index) => (
          <li key={`${tier.rankStart}:${tier.rankEnd}:${index}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-dashed border-[var(--md-sys-color-outline-variant)]/60 py-2.5">
            <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">
              {tier.rankStart === tier.rankEnd ? t(locale, "events.rankSingle", { start: tier.rankStart.toLocaleString(locale) }) : t(locale, "events.rankRange", { start: tier.rankStart.toLocaleString(locale), end: tier.rankEnd.toLocaleString(locale) })}
            </span>
            <span className="flex min-w-0 flex-wrap justify-end gap-2">
              {tier.rewards.map((reward, rewardIndex) => <RewardChip key={`${reward.kind}:${reward.id}:${rewardIndex}`} reward={reward} locale={locale} variant="icon" />)}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-[var(--md-sys-color-outline-variant)] pt-3 text-xs leading-6 text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.rankingRewardsNote")}</p>
    </Panel>
  );
}

function ChallengeMusicPanel({ locale, detail }: { locale: AppLocale; detail: EventChallengeLive }) {
  return (
    <Panel title={t(locale, "events.challengeLive")}>
      <p className="mb-4 whitespace-pre-line text-sm leading-7 text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.challengeLiveNote")}</p>
      {detail.songs.map((song) => (
        <section key={song.id} className="mb-6 min-w-0 last:mb-0">
          {song.music && (
            <a href={localizePath(`${getRoutePathById("music")}/${song.music.id}`, locale)} className="group mb-3 flex items-center gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]">
              <SongJacket locale={locale} music={song.music} />
              <span className="min-w-0">
                <span className="block truncate text-base font-black text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)]">{song.music.title}</span>
                {song.music.bandName && <span className="mt-0.5 block truncate text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">{song.music.bandName}</span>}
              </span>
            </a>
          )}
          {song.missions.length > 0 && (
            <div className="mb-3">
              <h4 className="mb-1.5 text-sm font-black text-[var(--md-sys-color-primary)]">{t(locale, "events.challengeMissions")}</h4>
              <p className="flex flex-wrap gap-2 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                {song.missions.map((value, index) => (
                  <span key={index} className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-2.5 py-0.5 tabular-nums text-[var(--md-sys-color-on-secondary-container)]">{t(locale, "events.challengeMissionValue", { count: value.toLocaleString(locale) })}</span>
                ))}
              </p>
            </div>
          )}
          {song.ranking.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-sm font-black text-[var(--md-sys-color-primary)]">{t(locale, "events.challengeRanking")}</h4>
              <MiniRanking locale={locale} tiers={song.ranking} />
            </div>
          )}
        </section>
      ))}
      {detail.boosts.length > 0 && <ChallengeBoostTable locale={locale} boosts={detail.boosts} />}
    </Panel>
  );
}

function SongJacket({ locale, music }: { locale: AppLocale; music: NonNullable<EventChallengeLive["songs"][number]["music"]> }) {
  const assetUrl = useAssetUrl();
  return <img className="h-14 w-14 shrink-0 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] object-cover" src={assetUrl(music.jacketUrl)} alt="" loading="lazy" />;
}

function MiniRanking({ locale, tiers }: { locale: AppLocale; tiers: EventRankingTier[] }) {
  return (
    <ol className="grid gap-x-6 sm:grid-cols-2">
      {tiers.map((tier, index) => (
        <li key={`${tier.rankStart}:${tier.rankEnd}:${index}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-dashed border-[var(--md-sys-color-outline-variant)]/60 py-2">
          <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">
            {tier.rankStart === tier.rankEnd ? t(locale, "events.rankSingle", { start: tier.rankStart.toLocaleString(locale) }) : t(locale, "events.rankRange", { start: tier.rankStart.toLocaleString(locale), end: tier.rankEnd.toLocaleString(locale) })}
          </span>
          <span className="flex min-w-0 flex-wrap justify-end gap-2">
            {tier.rewards.map((reward, rewardIndex) => <RewardChip key={`${reward.kind}:${reward.id}:${rewardIndex}`} reward={reward} locale={locale} variant="icon" />)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ChallengeBoostTable({ locale, boosts }: { locale: AppLocale; boosts: EventChallengeLive["boosts"] }) {
  return (
    <div className="mt-2">
      <h4 className="mb-1.5 text-sm font-black text-[var(--md-sys-color-primary)]">{t(locale, "events.challengeBoosts")}</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-left text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            <th className="py-2 pr-3 font-bold">{t(locale, "events.challengePointHeader")}</th>
            <th className="py-2 text-right font-bold">{t(locale, "events.challengeEventPointHeader")}</th>
            <th className="py-2 text-right font-bold">{t(locale, "events.challengeRewardRateHeader")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/60">
          {boosts.map((boost, index) => (
            <tr key={`${boost.challengePoint}:${index}`}>
              <td className="py-2.5 pr-3 font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">{boost.challengePoint.toLocaleString(locale)}</td>
              <td className="py-2.5 text-right font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">×{boost.eventPointRate}</td>
              <td className="py-2.5 text-right font-bold tabular-nums text-[var(--md-sys-color-primary)]">×{boost.rewardRate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiveTable({ locale, rows }: { locale: AppLocale; rows: EventLiveRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-left text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
          <th className="w-20 py-2 font-bold">{t(locale, "events.scoreRank")}</th>
          <th className="w-20 py-2 text-right font-bold">{t(locale, "events.livePoints")}</th>
          <th className="py-2 pl-4 font-bold">{t(locale, "events.liveItems")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/60">
        {rows.map((row) => (
          <tr key={row.scoreRank}>
            <td className="py-2 font-black tabular-nums text-[var(--md-sys-color-on-surface)]">{row.label || row.scoreRank}</td>
            <td className="py-2 text-right font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">{row.point === null ? "—" : row.point.toLocaleString(locale)}</td>
            <td className="py-2 pl-4">
              <span className="flex flex-wrap items-center gap-2">
                {row.rewards.map((reward, index) => (
                  <span key={`${reward.kind}:${reward.id}:${index}`} className="inline-flex items-center gap-1.5">
                    <RewardChip reward={reward} locale={locale} variant="icon" />
                    {reward.probability < 100 && <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "events.probability", { rate: reward.probability })}</span>}
                  </span>
                ))}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <MdMuiProvider>
      <Card variant="outlined" sx={{ px: { xs: 4, sm: 6 }, py: { xs: 4, sm: 6 }, textAlign: "center" }}>
        <Typography component="h2" sx={{ fontFamily: "var(--mn-font-display)", fontSize: 24, color: "var(--md-sys-color-on-surface)" }}>{t(locale, "events.notFoundTitle")}</Typography>
        <Typography variant="body2" sx={{ mx: "auto", mt: 1.5, maxWidth: 576, fontWeight: 500, lineHeight: 1.75, color: "var(--md-sys-color-on-surface-variant)" }}>{t(locale, "events.notFoundDescription")}</Typography>
        <Button component="a" href={localizePath(getRoutePathById("event-list"), locale)} variant="outlined" sx={{ mt: 3 }}>
          {t(locale, "events.backToList")}
        </Button>
      </Card>
    </MdMuiProvider>
  );
}

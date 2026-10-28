"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import MemberCardItem from "@/components/cards/MemberCardItem";
import EventBanner, { EventScene } from "@/components/events/EventBanner";
import AssetGallery, { type GalleryAsset } from "@/components/shared/AssetGallery";
import BandLogo from "@/components/shared/BandLogo";
import BannerImage from "@/components/shared/BannerImage";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ServerSchedules from "@/components/shared/ServerSchedules";
import TimesNote from "@/components/shared/TimesNote";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import DetailHero from "@/components/shared/DetailHero";
import { DetailRow } from "@/components/shared/DetailRows";
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
import { formatMasterDate, formatScheduleRange, scheduleStatus } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useSpoiler } from "@/lib/settings/spoiler";
import { SpoilerNotice, DeveloperTestingBanner } from "@/components/shared/SpoilerNotice";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  event: ServerFacetedValue<EventDetailViewModel> | null;
  servers: GameServer[];
}

const panelHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--md-ref-typeface-brand)] text-xl text-on-surface sm:text-2xl";
const CARD_RANKS = [1, 2, 3, 4, 5];

/** The event as the page's server has it (docs/servers.md). */
export default function EventDetail({ locale, event: faceted, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const event = useMemo(() => faceted && moveReleaseUrls(valueForServer(faceted, server), entityServer(faceted, server)), [faceted, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} hideSwitch>
      <EventDetailView locale={locale} server={server} event={event} serverSwitch={serverSwitch} schedules={faceted && <ServerSchedules locale={locale} faceted={faceted} servers={servers} alwaysLabel="" />} />
    </ServerScope>
  );
}

function EventDetailView({ locale, server, event, serverSwitch, schedules }: { locale: AppLocale; server: GameServer; event: EventDetailViewModel | null; serverSwitch: ReactNode; schedules: ReactNode }) {
  const assetUrl = useAssetUrl();
  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const timeZone = useDisplayTimeZone();
  const galleryAssets = useMemo<GalleryAsset[]>(() => {
    if (!event) return [];
    const items: GalleryAsset[] = [];
    if (event.bannerUrl) {
      items.push({
        id: "banner",
        label: t(locale, "events.assets.banner"),
        url: assetUrl(event.bannerUrl),
        shape: "banner",
        downloadName: `event-${event.id}-banner.png`,
      });
    }
    if (event.backgroundUrl) {
      items.push({
        id: "background",
        label: t(locale, "events.assets.background"),
        url: assetUrl(event.backgroundUrl),
        shape: "wide",
        downloadName: `event-${event.id}-background.png`,
      });
    }
    if (event.logoUrl) {
      items.push({
        id: "logo",
        label: t(locale, "events.assets.logo"),
        description: t(locale, "cards.assets.transparentLayer"),
        url: assetUrl(event.logoUrl),
        shape: "banner",
        transparent: true,
        compact: true,
        downloadName: `event-${event.id}-logo.png`,
      });
    }
    return items;
  }, [event, locale, assetUrl]);

  if (!event) return <NotFound locale={locale} />;

  const isUnreleased = Boolean(now !== null && scheduleStatus(event.startAt, event.endAt, now) === "upcoming");
  if (isUnreleased && !showSpoiler) {
    return <SpoilerNotice locale={locale} />;
  }

  const alt = t(locale, "events.bannerAlt", { name: event.name });
  const hasHeroScene = Boolean(event.backgroundUrl);
  const rankings = (["score", "music", "totalMusic"] as const).filter((kind) => event.rankings[kind]);
  const facts: Array<[string, ReactNode]> = [
    [t(locale, "events.period"), <span className="tabular-nums">{formatScheduleRange(event.startAt, event.endAt, locale, timeZone)}</span>],
    ...(event.displayEndAt ? [[t(locale, "events.displayUntil"), <span className="tabular-nums">{formatMasterDate(event.displayEndAt, locale, true, timeZone)}</span>] as [string, ReactNode]] : []),
    [t(locale, "events.rankings"), rankings.length ? rankings.map((kind) => t(locale, `events.rankingKinds.${kind}`)).join(" · ") : t(locale, "events.rankingOff")],
    [t(locale, "events.eventId"), `#${event.id}`],
  ];

  return (
    <div className="w-full space-y-8">
      {isUnreleased && <DeveloperTestingBanner locale={locale} />}
      <DetailHero
        title={event.name}
        aside={serverSwitch}
        eyebrow={<ScheduleBadge locale={locale} startAt={event.startAt} endAt={event.endAt} now={now} />}
      >
        {event.chapterDescription && <p className="mt-1 line-clamp-3 max-w-[60ch] whitespace-pre-line text-body-large text-on-surface-variant">{event.chapterDescription}</p>}
      </DetailHero>

      {hasHeroScene && (
        <div className="overflow-hidden rounded-shape-lg border border-outline-variant bg-surface-container-low shadow-elevation-1">
          <EventScene event={event} alt={alt} eager className="aspect-[4/3] sm:aspect-[16/9] xl:aspect-[5/2]" />
        </div>
      )}

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          <div className="md3-surface p-4">
            <AssetGallery
              locale={locale}
              assets={galleryAssets}
              shape="banner"
              eager={!hasHeroScene}
              fallback={<EventBanner event={event} alt={alt} eager={!hasHeroScene} className="rounded-shape-md border border-outline-variant" />}
            />
          </div>
          <div className="md3-surface overflow-hidden">
            <dl className="divide-y divide-outline-variant px-6">
              {facts.map(([label, value]) => <DetailRow key={label} label={label} value={value} />)}
              {event.eventItem && <DetailRow label={t(locale, "events.eventItem")} value={<RewardChip reward={event.eventItem} locale={locale} />} />}
            </dl>
            {rankings.length > 0 && (
              <div className="px-6 pb-4 pt-2">
                <a
                  href={getEventTrackerHref(locale, { server, event: String(event.id) })}
                  className="md3-button md3-button--tonal md3-button--small"
                >
                  {t(locale, "eventTracker.openTracker")}
                </a>
              </div>
            )}
            <TimesNote locale={locale} value={event.startAt || event.endAt} timeZone={timeZone} className="px-6 pb-5 text-body-small text-on-surface-variant" />
            <div className="px-6 pb-5 empty:hidden">{schedules}</div>
          </div>
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
            <a href={localizePath(getRoutePathById("event-list"), locale)} className="md3-button md3-button--tonal">
              {t(locale, "events.backToList")}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Gachas featuring the event's cards: the event's own cards and the cards its bonus names, among their rate-up prizes. */
function RelatedGachaPanel({ locale, gachas, now }: { locale: AppLocale; gachas: EventRelatedGacha[]; now: number | null }) {
  return (
    <Panel title={t(locale, "events.relatedGacha")}>
      <p className="mb-4 text-body-small leading-6 text-on-surface-variant">{t(locale, "events.relatedGachaNote")}</p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {gachas.map((gacha) => (
          <li key={gacha.id} className="min-w-0">
            <a
              href={localizePath(entityLinkPath({ routeId: "gacha", detailId: gacha.id }), locale)}
              className="mn-list-card group flex h-full min-w-0 flex-col overflow-hidden border border-outline-variant bg-surface-container-low shadow-elevation-1 transition hover:shadow-elevation-1"
            >
              <BannerImage src={getImageAssetUrl(gacha.bannerPath, locale)} alt="" fallback={gacha.name} />
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <span className="line-clamp-2 text-label-large leading-5 text-on-surface group-hover:text-primary">{gacha.name}</span>
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

function SongPanel({ locale, song }: { locale: AppLocale; song: MusicViewModel }) {
  const assetUrl = useAssetUrl();
  return (
    <div className="md3-surface overflow-hidden">
      <div className={panelHeader}><h3 className={panelTitle}>{t(locale, "events.song")}</h3></div>
      <a href={localizePath(`${getRoutePathById("music")}/${song.id}`, locale)} className="group flex items-center gap-4 p-4 sm:p-6">
        <img className="h-16 w-16 shrink-0 rounded-shape-md border border-outline-variant bg-surface-container-highest object-cover" src={assetUrl(song.jacketUrl)} alt="" loading="lazy" />
        <span className="min-w-0">
          <span className="block truncate text-title-medium text-on-surface group-hover:text-primary">{song.title}</span>
          {song.bandName && <span className="mt-0.5 block truncate text-body-small text-on-surface-variant">{song.bandName}</span>}
        </span>
      </a>
    </div>
  );
}

function BonusPanel({ locale, groups }: { locale: AppLocale; groups: EventBonusGroup[] }) {
  const [rank, setRank] = useState(CARD_RANKS[0]!);
  const percent = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);
  const value = (values: number[] | null) => {
    const current = values?.[rank - 1];
    return current === undefined ? <span className="text-on-surface-variant">—</span> : t(locale, "events.bonusValue", { value: percent.format(current) });
  };

  return (
    <Panel
      title={t(locale, "events.bonus")}
      actions={<Segmented label={t(locale, "events.bonusRankLabel")} options={CARD_RANKS} value={rank} onChange={setRank} format={(option) => t(locale, "events.bonusRank", { rank: option })} />}
    >
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.cardKind} className="min-w-0">
            <h4 className="mb-2 text-label-large text-primary">{t(locale, `events.bonusCardKinds.${group.cardKind}`)}</h4>
            <table className="w-full table-fixed text-body-medium">
              <thead>
                <tr className="border-b border-outline-variant text-left text-label-medium text-on-surface-variant">
                  <th className="py-2 pr-3 font-bold">{t(locale, "events.bonusTarget")}</th>
                  <th className="w-24 py-2 text-right font-bold sm:w-28">{t(locale, "events.bonusParameter")}</th>
                  <th className="w-24 py-2 text-right font-bold sm:w-28">{t(locale, "events.bonusEventItem")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-outline-variant/60">
                {group.bonuses.map((bonus) => (
                  <tr key={bonusKey(bonus)}>
                    <td className="py-2.5 pr-3"><BonusTargetLabel locale={locale} target={bonus.target} /></td>
                    <td className="py-2.5 text-right font-mono font-bold tabular-nums text-on-surface">{value(bonus.parameter)}</td>
                    <td className="py-2.5 text-right font-mono font-bold tabular-nums text-primary">{value(bonus.eventItem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <p className="border-t border-outline-variant pt-3 text-body-small leading-6 text-on-surface-variant">{t(locale, "events.bonusNote")}</p>
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
        className={`shrink-0 border border-outline-variant bg-surface-container object-cover ${small ? "h-6 w-6 rounded-full border-0 bg-transparent object-contain" : round ? "h-9 w-9 rounded-full" : "h-10 w-10 rounded-shape-md"}`}
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
      <span className="min-w-0 truncate font-bold text-on-surface group-hover:text-primary">{name}</span>
    </>
  );
  const href = target.link ? localizePath(entityLinkPath(target.link), locale) : null;
  const className = "flex min-w-0 items-center gap-2.5";
  return href
    ? <a href={href} className={`group ${className}`}>{content}</a>
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
      {event.chapterDescription && <p className="mb-4 whitespace-pre-line text-body-medium leading-7 text-on-surface-variant">{event.chapterDescription}</p>}
      <ol className="grid gap-3 sm:grid-cols-2">
        {event.story.map((episode) => (
          <li key={episode.advId} className="min-w-0">
            <a
              href={localizePath(`${getRoutePathById("story")}/${episode.advId}`, locale)}
              className="mn-list-card-row group flex min-w-0 items-center gap-3 border border-outline-variant bg-surface-container p-2.5 transition hover:border-primary"
            >
              {episode.imageUrl
                ? <img src={assetUrl(episode.imageUrl)} alt="" className="h-14 w-24 shrink-0 rounded-shape-sm object-cover" loading="lazy" />
                : <span className="md3-placeholder h-14 w-24 shrink-0 rounded-shape-sm" aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block text-label-small text-primary">{episodeLabel(locale, episode)}</span>
                <span className="block truncate text-label-large text-on-surface group-hover:text-primary">{episode.title}</span>
                {episode.eventPoint > 0 && <span className="block font-mono text-label-small tabular-nums text-on-surface-variant">{t(locale, "events.storyUnlock", { count: episode.eventPoint.toLocaleString(locale) })}</span>}
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
          <li key={`${tier.point}:${index}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-dashed border-outline-variant/60 py-2.5">
            <span className="shrink-0 font-mono text-label-large tabular-nums text-on-surface">{t(locale, "events.points", { count: tier.point.toLocaleString(locale) })}</span>
            <span className="flex min-w-0 flex-wrap justify-end gap-2">
              {tier.rewards.map((reward, rewardIndex) => <RewardChip key={`${reward.kind}:${reward.id}:${rewardIndex}`} reward={reward} locale={locale} variant="icon" />)}
            </span>
          </li>
        ))}
      </ol>
      {loop && loop.rewards.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-shape-md bg-secondary-container px-3 py-2.5">
          <span className="text-label-large text-primary">{t(locale, "events.loopReward", { from: loop.from.toLocaleString(locale), every: loop.every.toLocaleString(locale) })}</span>
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
            <h4 className="mb-2 text-label-large text-primary">{t(locale, `events.liveKinds.${kind}`)}</h4>
            <LiveTable locale={locale} rows={rows} />
          </section>
        ))}
      </div>
      <p className="mt-4 border-t border-outline-variant pt-3 text-body-small leading-6 text-on-surface-variant">{t(locale, "events.liveNote")}</p>
    </Panel>
  );
}

function MissionsPanel({ locale, missions }: { locale: AppLocale; missions: EventMissionRow[] }) {
  return (
    <Panel title={t(locale, "events.missions")}>
      <ol className="divide-y divide-dashed divide-outline-variant/60">
        {missions.map((mission) => (
          <li key={mission.id} className="flex min-w-0 items-center justify-between gap-4 py-3">
            <span className="min-w-0 flex-1 text-label-large leading-6 text-on-surface">{mission.description || `#${mission.id}`}</span>
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
          <p className="text-label-large text-on-surface-variant">{t(locale, "events.boxGachaCost", { count: boxGacha.item.count.toLocaleString(locale) })}</p>
        )}
        {boxGacha.boxes.map((box) => (
          <section key={box.tier} className="min-w-0">
            <h4 className="mb-2 flex items-center justify-between gap-3 text-label-large text-primary">
              <span>{t(locale, "events.boxGachaBox", { n: box.tier })}</span>
              <span className="text-label-medium text-on-surface-variant">{t(locale, "events.boxGachaCost", { count: box.cost.toLocaleString(locale) })}</span>
            </h4>
            <BoxGachaTable locale={locale} items={box.items} />
          </section>
        ))}
        {boxGacha.loop && (
          <section className="min-w-0">
            <h4 className="mb-2 text-label-large text-primary">{t(locale, "events.boxGachaLoop", { n: boxGacha.loop.tier })}</h4>
            <BoxGachaTable locale={locale} items={boxGacha.loop.items} />
          </section>
        )}
        <p className="border-t border-outline-variant pt-3 text-body-small leading-6 text-on-surface-variant">{t(locale, "events.boxGachaNote")}</p>
      </div>
    </Panel>
  );
}

function BoxGachaTable({ locale, items }: { locale: AppLocale; items: EventBoxGachaItem[] }) {
  return (
    <ol className="grid gap-x-6 sm:grid-cols-2">
      {items.map((item, index) => (
        <li key={`${item.kind}:${item.id}:${index}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-dashed border-outline-variant/60 py-2">
          <span className="flex min-w-0 flex-1 items-center"><RewardChip reward={item} locale={locale} variant="icon" /></span>
          <span className="shrink-0 whitespace-nowrap text-body-small font-mono tabular-nums text-on-surface-variant">
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
          <li key={`${tier.rankStart}:${tier.rankEnd}:${index}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-dashed border-outline-variant/60 py-2.5">
            <span className="shrink-0 font-mono text-label-large tabular-nums text-on-surface">
              {tier.rankStart === tier.rankEnd ? t(locale, "events.rankSingle", { start: tier.rankStart.toLocaleString(locale) }) : t(locale, "events.rankRange", { start: tier.rankStart.toLocaleString(locale), end: tier.rankEnd.toLocaleString(locale) })}
            </span>
            <span className="flex min-w-0 flex-wrap justify-end gap-2">
              {tier.rewards.map((reward, rewardIndex) => <RewardChip key={`${reward.kind}:${reward.id}:${rewardIndex}`} reward={reward} locale={locale} variant="icon" />)}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-outline-variant pt-3 text-body-small leading-6 text-on-surface-variant">{t(locale, "events.rankingRewardsNote")}</p>
    </Panel>
  );
}

function ChallengeMusicPanel({ locale, detail }: { locale: AppLocale; detail: EventChallengeLive }) {
  return (
    <Panel title={t(locale, "events.challengeLive")}>
      <p className="mb-4 whitespace-pre-line text-body-medium leading-7 text-on-surface-variant">{t(locale, "events.challengeLiveNote")}</p>
      {detail.songs.map((song) => (
        <section key={song.id} className="mb-6 min-w-0 last:mb-0">
          {song.music && (
            <a href={localizePath(`${getRoutePathById("music")}/${song.music.id}`, locale)} className="group mb-3 flex items-center gap-4">
              <SongJacket locale={locale} music={song.music} />
              <span className="min-w-0">
                <span className="block truncate text-title-medium text-on-surface group-hover:text-primary">{song.music.title}</span>
                {song.music.bandName && <span className="mt-0.5 block truncate text-body-small text-on-surface-variant">{song.music.bandName}</span>}
              </span>
            </a>
          )}
          {song.missions.length > 0 && (
            <div className="mb-3">
              <h4 className="mb-1.5 text-label-large text-primary">{t(locale, "events.challengeMissions")}</h4>
              <p className="flex flex-wrap gap-2 text-label-large text-on-surface">
                {song.missions.map((value, index) => (
                  <span key={index} className="rounded-full bg-secondary-container px-2.5 py-0.5 font-mono tabular-nums text-primary">{t(locale, "events.challengeMissionValue", { count: value.toLocaleString(locale) })}</span>
                ))}
              </p>
            </div>
          )}
          {song.ranking.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-label-large text-primary">{t(locale, "events.challengeRanking")}</h4>
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
  return <img className="h-14 w-14 shrink-0 rounded-shape-md border border-outline-variant bg-surface-container-highest object-cover" src={assetUrl(music.jacketUrl)} alt="" loading="lazy" />;
}

function MiniRanking({ locale, tiers }: { locale: AppLocale; tiers: EventRankingTier[] }) {
  return (
    <ol className="grid gap-x-6 sm:grid-cols-2">
      {tiers.map((tier, index) => (
        <li key={`${tier.rankStart}:${tier.rankEnd}:${index}`} className="flex min-w-0 items-center justify-between gap-3 border-b border-dashed border-outline-variant/60 py-2">
          <span className="shrink-0 font-mono text-label-large tabular-nums text-on-surface">
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
      <h4 className="mb-1.5 text-label-large text-primary">{t(locale, "events.challengeBoosts")}</h4>
      <table className="w-full text-body-medium">
        <thead>
          <tr className="border-b border-outline-variant text-left text-label-medium text-on-surface-variant">
            <th className="py-2 pr-3 font-bold">{t(locale, "events.challengePointHeader")}</th>
            <th className="py-2 text-right font-bold">{t(locale, "events.challengeEventPointHeader")}</th>
            <th className="py-2 text-right font-bold">{t(locale, "events.challengeRewardRateHeader")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dashed divide-outline-variant/60">
          {boosts.map((boost, index) => (
            <tr key={`${boost.challengePoint}:${index}`}>
              <td className="py-2.5 pr-3 font-mono font-bold tabular-nums text-on-surface">{boost.challengePoint.toLocaleString(locale)}</td>
              <td className="py-2.5 text-right font-mono font-bold tabular-nums text-on-surface">×{boost.eventPointRate}</td>
              <td className="py-2.5 text-right font-mono font-bold tabular-nums text-primary">×{boost.rewardRate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiveTable({ locale, rows }: { locale: AppLocale; rows: EventLiveRow[] }) {
  return (
    <table className="w-full text-body-medium">
      <thead>
        <tr className="border-b border-outline-variant text-left text-label-medium text-on-surface-variant">
          <th className="w-20 py-2 font-bold">{t(locale, "events.scoreRank")}</th>
          <th className="w-20 py-2 text-right font-bold">{t(locale, "events.livePoints")}</th>
          <th className="py-2 pl-4 font-bold">{t(locale, "events.liveItems")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-dashed divide-outline-variant/60">
        {rows.map((row) => (
          <tr key={row.scoreRank}>
            <td className="py-2 font-mono font-black text-on-surface">{row.label || row.scoreRank}</td>
            <td className="py-2 text-right font-mono font-bold tabular-nums text-on-surface">{row.point === null ? "—" : row.point.toLocaleString(locale)}</td>
            <td className="py-2 pl-4">
              <span className="flex flex-wrap items-center gap-2">
                {row.rewards.map((reward, index) => (
                  <span key={`${reward.kind}:${reward.id}:${index}`} className="inline-flex items-center gap-1.5">
                    <RewardChip reward={reward} locale={locale} variant="icon" />
                    {reward.probability < 100 && <span className="text-label-small text-on-surface-variant">{t(locale, "events.probability", { rate: reward.probability })}</span>}
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
    <div className="md3-surface p-8 text-center sm:p-12">
      <h1 className="text-headline-small text-on-surface">{t(locale, "events.notFoundTitle")}</h1>
      <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "events.notFoundDescription")}</p>
      <a href={localizePath(getRoutePathById("event-list"), locale)} className="md3-button md3-button--tonal mt-6">
        {t(locale, "events.backToList")}
      </a>
    </div>
  );
}

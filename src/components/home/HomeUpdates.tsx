import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import type { HomeData } from "@/lib/home/data";
import { valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import MemberCardItem from "@/components/cards/MemberCardItem";
import SongCard from "@/components/music/SongCard";
import BannerImage from "@/components/shared/BannerImage";
import RewardChip from "@/components/shared/RewardChip";
import { rewardBannerCrop } from "@/components/rewards/RewardsExplorer";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import ServerAvailabilityBadge from "@/components/shared/ServerAvailabilityBadge";
import SectionHeading, { SectionLink } from "@/components/shared/SectionHeading";
import SupportCardItem from "@/components/support-cards/SupportCardItem";
import type { CardViewModel } from "@/lib/cards/data";
import type { RewardEntrySummary } from "@/lib/rewards/data";
import type { MusicViewModel } from "@/lib/music/data";
import { getRoutePathById } from "@/lib/route/registry";
import { parseMasterDate } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

interface Props {
  locale: AppLocale;
  home: ServerFacetedValue<Pick<HomeData, "rewards" | "latestMusic" | "latestCards" | "latestSupportCards">>;
  servers: GameServer[];
  /** Which module this island renders; the page places each in its own layout slot. */
  module: HomeUpdatesModule;
  /** The servers that have each listed song / card / support card (from the merged catalog), for the availability badges. */
  availability?: HomeAvailability;
}

export interface HomeAvailability {
  music: Record<number, GameServer[]>;
  cards: Record<number, GameServer[]>;
  supportCards: Record<number, GameServer[]>;
}

export type HomeUpdatesModule = "rewards" | "music" | "cards";

interface UpdatesProps {
  locale: AppLocale;
  module: HomeUpdatesModule;
  servers: readonly GameServer[];
  availability: HomeAvailability;
  rewards: RewardEntrySummary[];
  songs: MusicViewModel[];
  cards: CardViewModel[];
  supportCards: SupportCardViewModel[];
}

type CardKind = "member" | "support";

const latestGrid = "grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6";

/** The latest releases of the page's server; the carousel holds the server switch. */
export default function HomeUpdates({ locale, home, servers, module, availability = { music: {}, cards: {}, supportCards: {} } }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const { rewards, latestMusic, latestCards, latestSupportCards } = valueForServer(home, server);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} hideSwitch>
      <Updates locale={locale} module={module} servers={servers} availability={availability} rewards={rewards} songs={latestMusic} cards={latestCards} supportCards={latestSupportCards} />
    </ServerScope>
  );
}

function Updates({ locale, module, servers, availability, rewards, songs, cards, supportCards }: UpdatesProps) {
  const now = useNow();
  const [cardKind, setCardKind] = useState<CardKind>("member");
  const upcoming = t(locale, "schedule.upcoming");
  // Scheduled releases already ship in MasterData; mark them once the browser clock is known.
  const badgeFor = (startAt: string) => {
    const start = parseMasterDate(startAt);
    return now !== null && start !== null && start > now ? { badge: upcoming } : {};
  };

  // Flags of the servers that have an entry, when some of the build's servers lack it.
  const flags = (ids: Record<number, GameServer[]>, id: number) => <ServerAvailabilityBadge locale={locale} entity={{ servers: ids[id] ?? [] }} servers={servers} />;

  if (module === "rewards") {
    return (
      <section aria-labelledby="home-rewards">
        <SectionHeading id="home-rewards" title={t(locale, "home.activities")}>
          <SectionLink href={localizePath(getRoutePathById("rewards"), locale)} label={t(locale, "home.viewAll")} />
        </SectionHeading>
        {rewards.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rewards.map((entry) => <RewardRow key={entry.slug} entry={entry} locale={locale} now={now} />)}
          </ul>
        ) : (
          <div className="mn-paper px-6 py-8 text-center">
            <h3 className="font-[var(--mn-font-display)] text-lg text-[var(--mn-text)]">{t(locale, "home.noActivitiesTitle")}</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-[var(--mn-text-muted)]">{t(locale, "home.noActivitiesDescription")}</p>
          </div>
        )}
      </section>
    );
  }

  if (module === "music") {
    if (songs.length === 0) return null;
    return (
      <section aria-labelledby="home-music">
        <SectionHeading id="home-music" title={t(locale, "home.latestMusic")}>
          <SectionLink href={localizePath(getRoutePathById("music"), locale)} label={t(locale, "home.viewAll")} />
        </SectionHeading>
        <div className={latestGrid}>
          {songs.map((song) => (
            <div key={song.id} className="relative min-w-0">
              <SongCard song={song} locale={locale} {...badgeFor(song.startAt)} />
              <span className="pointer-events-none absolute right-2 top-9 z-10">{flags(availability.music, song.id)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="home-cards">
      <SectionHeading id="home-cards" title={t(locale, "home.latestCards")}>
        <div className="mn-segmented flex gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={t(locale, "home.cardKind")}>
          {(["member", "support"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setCardKind(kind)}
              aria-pressed={cardKind === kind}
              className={`mn-focus rounded-full px-3 py-1 text-xs font-bold transition ${cardKind === kind ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
            >
              {t(locale, kind === "member" ? "nav.items.cards" : "nav.items.supportCards")}
            </button>
          ))}
        </div>
        <SectionLink href={localizePath(getRoutePathById(cardKind === "member" ? "cards" : "support-cards"), locale)} label={t(locale, "home.viewAll")} />
      </SectionHeading>
      <div className={latestGrid}>
        {cardKind === "member"
          ? cards.map((card) => (
            <div key={card.id} className="relative min-w-0">
              <MemberCardItem card={card} locale={locale} {...badgeFor(card.startAt)} />
              <span className="pointer-events-none absolute right-2 top-9 z-10">{flags(availability.cards, card.id)}</span>
            </div>
          ))
          : supportCards.map((card) => (
            <div key={card.id} className="relative min-w-0">
              <SupportCardItem card={card} locale={locale} {...badgeFor(card.startAt)} />
              <span className="pointer-events-none absolute right-2 top-9 z-10">{flags(availability.supportCards, card.id)}</span>
            </div>
          ))}
      </div>
    </section>
  );
}

function RewardRow({ entry, locale, now }: { entry: RewardEntrySummary; locale: AppLocale; now: number | null }) {
  return (
    <li className="min-w-0">
      <a
        href={localizePath(`${getRoutePathById("rewards")}/${entry.slug}`, locale)}
        className="mn-list-card mn-list-card-row group flex min-w-0 items-center gap-3 border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] p-3"
      >
        <div className="w-28 shrink-0 sm:w-36">
          <BannerImage className="mn-list-caption" src={entry.bannerUrl} alt="" fallback={t(locale, `rewards.kinds.${entry.kind}`)} imageClassName={rewardBannerCrop(entry.kind)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-[var(--mn-accent-deep)]">{t(locale, `rewards.kinds.${entry.kind}`)}</span>
            <ScheduleBadge locale={locale} startAt={entry.startAt} endAt={entry.endAt} now={now} />
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm font-bold leading-5 text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]">{entry.title}</p>
          {entry.highlights.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {entry.highlights.slice(0, 4).map((reward) => <RewardChip key={`${reward.kind}:${reward.id}`} reward={reward} locale={locale} variant="icon" linked={false} />)}
            </div>
          )}
        </div>
      </a>
    </li>
  );
}

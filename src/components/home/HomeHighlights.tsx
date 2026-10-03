import { useMemo } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import EventBanner from "@/components/events/EventBanner";
import BannerImage from "@/components/shared/BannerImage";
import ScheduleCountdown from "@/components/shared/ScheduleCountdown";
import SectionHeading, { SectionLink } from "@/components/shared/SectionHeading";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getCardThumbnailUrl, getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { getImageAssetUrl } from "@/lib/assets/url";
import { eventPath } from "@/lib/events/links";
import { BIRTHDAY_LOOKAHEAD_DAYS, birthdayCardFor, birthdayGachaFor, currentHomeEvent, upcomingBirthdays, type HomeBirthday, type HomeData, type HomeEvent, type UpcomingBirthday } from "@/lib/home/data";
import { entityLinkPath } from "@/lib/route/entity-link";
import { getRoutePathById } from "@/lib/route/registry";
import { browserTimeZone, formatScheduleRange } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useNow } from "@/lib/schedule/use-now";
import { valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  home: ServerFacetedValue<Pick<HomeData, "events" | "birthdays">>;
  servers: GameServer[];
  /** Which module this island renders; the page places each in its own layout slot. */
  module: "event" | "birthdays";
}

/** The current event, or the coming birthdays, of the page's server; the carousel holds the server switch. */
export default function HomeHighlights({ locale, home, servers, module }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const { events, birthdays } = valueForServer(home, server);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} hideSwitch>
      {module === "event" ? <CurrentEvent locale={locale} events={events} /> : <Birthdays locale={locale} birthdays={birthdays} />}
    </ServerScope>
  );
}

function CurrentEvent({ locale, events }: { locale: AppLocale; events: HomeEvent[] }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  // Before the clock is known, the build's first unfinished event (the static HTML).
  const event = now === null ? events[0] ?? null : currentHomeEvent(events, now);
  return (
    <section aria-labelledby="home-event">
      <SectionHeading id="home-event" title={t(locale, "home.currentEvent")}>
        <SectionLink href={localizePath(getRoutePathById("event-list"), locale)} label={t(locale, "home.viewAll")} />
      </SectionHeading>
      {event ? (
        <a
          href={localizePath(eventPath(event.id), locale)}
          className="mn-list-card group grid min-w-0 overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
        >
          <EventBanner event={event} alt="" className="sm:h-full" />
          <div className="flex min-w-0 flex-col gap-2 p-4">
            <ScheduleCountdown locale={locale} startAt={event.startAt} endAt={event.endAt} now={now} />
            <h3 className="line-clamp-2 font-[var(--mn-font-display)] text-lg leading-snug text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]">{event.name}</h3>
            <p className="text-xs font-medium tabular-nums text-[var(--mn-text-muted)]">{formatScheduleRange(event.startAt, event.endAt, locale, timeZone)}</p>
            {event.characters.length > 0 && <EventFaces characters={event.characters} />}
          </div>
        </a>
      ) : (
        <p className="mn-paper px-6 py-8 text-center text-sm text-[var(--mn-text-muted)]">{t(locale, "home.noEvent")}</p>
      )}
    </section>
  );
}

function EventFaces({ characters }: { characters: HomeEvent["characters"] }) {
  const assetUrl = useAssetUrl();
  return (
    <span className="mt-auto flex flex-wrap items-center gap-1 pt-1" title={characters.map((character) => character.name).join(" / ")}>
      {characters.slice(0, 10).map((character) => (
        <img key={character.id} src={assetUrl(getCharacterFaceIconUrl(character.id))} alt={character.name} loading="lazy" className="h-7 w-7 rounded-full border-2 border-[var(--mn-paper)] bg-[var(--mn-cream-deep)] object-cover" />
      ))}
    </span>
  );
}

function Birthdays({ locale, birthdays }: { locale: AppLocale; birthdays: HomeBirthday[] }) {
  const now = useNow();
  const displayZone = useDisplayTimeZone();
  const timeZone = displayZone ?? browserTimeZone() ?? "UTC";
  const upcoming = useMemo(() => (now === null ? [] : upcomingBirthdays(birthdays, now, timeZone)), [birthdays, now, timeZone]);
  return (
    <section aria-labelledby="home-birthdays">
      <SectionHeading id="home-birthdays" title={t(locale, "home.birthdays")}>
        <SectionLink href={localizePath(getRoutePathById("calendar"), locale)} label={t(locale, "home.openCalendar")} />
      </SectionHeading>
      {now === null ? (
        <div className="h-24" aria-hidden="true" />
      ) : upcoming.length === 0 ? (
        <p className="mn-paper px-6 py-8 text-center text-sm text-[var(--mn-text-muted)]">{t(locale, "home.noBirthdays", { days: BIRTHDAY_LOOKAHEAD_DAYS })}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {upcoming.map((entry) => <BirthdayRow key={entry.birthday.characterId} locale={locale} entry={entry} now={now} />)}
        </ul>
      )}
    </section>
  );
}

function BirthdayRow({ locale, entry, now }: { locale: AppLocale; entry: UpcomingBirthday; now: number }) {
  const assetUrl = useAssetUrl();
  const { birthday, daysLeft, at } = entry;
  const card = birthdayCardFor(birthday, at);
  const gacha = birthdayGachaFor(birthday, at, now);
  const dateLabel = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(Date.UTC(2000, birthday.month - 1, birthday.day));
  const characterHref = localizePath(entityLinkPath({ routeId: "characters", detailId: birthday.characterId }), locale);
  return (
    <li className="mn-list-card mn-list-card-row flex min-w-0 flex-col gap-3 border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] p-3" style={{ borderLeft: `4px solid ${birthday.color || "var(--mn-accent)"}` }}>
      <a href={characterHref} className="mn-focus group flex min-w-0 items-center gap-3">
        <img src={assetUrl(getCharacterFaceIconUrl(birthday.characterId))} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-full border-2 bg-[var(--mn-cream-deep)] object-cover" style={{ borderColor: birthday.color || "var(--mn-border)" }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]">{birthday.name}</span>
          <span className="block truncate text-xs font-medium text-[var(--mn-text-muted)]">{dateLabel} · {birthday.bandName}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black tabular-nums ${daysLeft === 0 ? "bg-[var(--mn-accent-deep)] text-[var(--mn-paper)]" : "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"}`}>
          {daysLeft === 0 ? t(locale, "home.birthdayToday") : t(locale, "home.birthdayIn", { count: daysLeft })}
        </span>
      </a>
      {(card || gacha || birthday.birthdayStoryAdvId) && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--mn-glass-border)] pt-2">
          {card && (
            <a href={localizePath(entityLinkPath({ routeId: "cards", detailId: card.id }), locale)} className="mn-focus flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface)] py-0.5 pl-0.5 pr-3 text-xs font-bold text-[var(--mn-ink-soft)] hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)]" title={card.title}>
              <img src={assetUrl(getCardThumbnailUrl(card.assetId))} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              <span className="truncate">{t(locale, "home.birthdayCard")}</span>
            </a>
          )}
          {gacha && (
            <a href={localizePath(entityLinkPath({ routeId: "gacha", detailId: gacha.id }), locale)} className="mn-focus flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface)] py-0.5 pl-0.5 pr-3 text-xs font-bold text-[var(--mn-ink-soft)] hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)]" title={gacha.name}>
              <span className="w-14 shrink-0 overflow-hidden rounded-full"><BannerImage src={getImageAssetUrl(gacha.bannerPath, locale)} alt="" fallback="" /></span>
              <span className="truncate">{t(locale, "home.birthdayGacha")}</span>
            </a>
          )}
          {birthday.birthdayStoryAdvId ? (
            <a href={localizePath(entityLinkPath({ routeId: "story", detailId: birthday.birthdayStoryAdvId }), locale)} className="mn-focus flex items-center rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface)] px-3 py-1.5 text-xs font-bold text-[var(--mn-ink-soft)] hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)]">
              {t(locale, "home.birthdayStory")}
            </a>
          ) : null}
        </div>
      )}
    </li>
  );
}

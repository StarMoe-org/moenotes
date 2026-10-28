"use client";

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
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";
import { SPOILER_REFERENCE_NOW } from "@/lib/settings/spoiler-reference";
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
  const { showSpoiler } = useSpoiler();
  // The reference is the page's render time until the browser clock is known, so the server markup and the first
  // client render feature the same event (an upcoming one could otherwise show for a frame and then be replaced).
  const reference = now ?? SPOILER_REFERENCE_NOW;
  const event = useMemo(() => {
    const visible = showSpoiler ? events : events.filter((entry) => !isSpoiler(entry.startAt, reference));
    return currentHomeEvent(visible, reference);
  }, [events, showSpoiler, reference]);
  return (
    <section aria-labelledby="home-event">
      <SectionHeading id="home-event" title={t(locale, "home.currentEvent")}>
        <SectionLink href={localizePath(getRoutePathById("event-list"), locale)} label={t(locale, "home.viewAll")} />
      </SectionHeading>
      {event ? (
        <a
          href={localizePath(eventPath(event.id), locale)}
          className="mn-list-card group grid min-w-0 overflow-hidden border border-outline-variant bg-surface-container-low sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
        >
          <EventBanner event={event} alt="" className="sm:h-full" />
          <div className="flex min-w-0 flex-col gap-2 p-4">
            <ScheduleCountdown locale={locale} startAt={event.startAt} endAt={event.endAt} now={now} />
            <h3 className="line-clamp-2 font-[var(--md-ref-typeface-brand)] text-title-large text-on-surface group-hover:text-primary">{event.name}</h3>
            <p className="text-body-small tabular-nums text-on-surface-variant">{formatScheduleRange(event.startAt, event.endAt, locale, timeZone)}</p>
            {event.characters.length > 0 && <EventFaces characters={event.characters} />}
          </div>
        </a>
      ) : (
        <p className="md3-surface px-6 py-8 text-center text-body-medium text-on-surface-variant">{t(locale, "home.noEvent")}</p>
      )}
    </section>
  );
}

function EventFaces({ characters }: { characters: HomeEvent["characters"] }) {
  const assetUrl = useAssetUrl();
  return (
    <span className="mt-auto flex flex-wrap items-center gap-1 pt-1" title={characters.map((character) => character.name).join(" / ")}>
      {characters.slice(0, 10).map((character) => (
        <img key={character.id} src={assetUrl(getCharacterFaceIconUrl(character.id))} alt={character.name} loading="lazy" className="h-7 w-7 rounded-full border-2 border-surface-container-low bg-surface-container-highest object-cover" />
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
        <p className="md3-surface px-6 py-8 text-center text-body-medium text-on-surface-variant">{t(locale, "home.noBirthdays", { days: BIRTHDAY_LOOKAHEAD_DAYS })}</p>
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
    <li className="mn-list-card mn-list-card-row flex min-w-0 flex-col gap-3 border border-outline-variant bg-surface-container-low p-3" style={{ borderLeft: `4px solid ${birthday.color || "var(--md-sys-color-primary)"}` }}>
      <a href={characterHref} className="group flex min-w-0 items-center gap-3">
        <img src={assetUrl(getCharacterFaceIconUrl(birthday.characterId))} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-full border-2 bg-surface-container-highest object-cover" style={{ borderColor: birthday.color || "var(--md-sys-color-outline-variant)" }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-label-large text-on-surface group-hover:text-primary">{birthday.name}</span>
          <span className="block truncate text-body-small text-on-surface-variant">{dateLabel} · {birthday.bandName}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-label-medium tabular-nums ${daysLeft === 0 ? "bg-primary text-on-primary" : "bg-secondary-container text-primary"}`}>
          {daysLeft === 0 ? t(locale, "home.birthdayToday") : t(locale, "home.birthdayIn", { count: daysLeft })}
        </span>
      </a>
      {(card || gacha || birthday.birthdayStoryAdvId) && (
        <div className="flex flex-wrap gap-2 border-t border-outline-variant pt-2">
          {card && (
            <a href={localizePath(entityLinkPath({ routeId: "cards", detailId: card.id }), locale)} className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-outline-variant bg-surface-container py-0.5 pl-0.5 pr-3 text-label-medium text-on-surface-variant hover:border-primary hover:text-primary" title={card.title}>
              <img src={assetUrl(getCardThumbnailUrl(card.assetId))} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              <span className="truncate">{t(locale, "home.birthdayCard")}</span>
            </a>
          )}
          {gacha && (
            <a href={localizePath(entityLinkPath({ routeId: "gacha", detailId: gacha.id }), locale)} className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-outline-variant bg-surface-container py-0.5 pl-0.5 pr-3 text-label-medium text-on-surface-variant hover:border-primary hover:text-primary" title={gacha.name}>
              <span className="w-14 shrink-0 overflow-hidden rounded-full"><BannerImage src={getImageAssetUrl(gacha.bannerPath, locale)} alt="" fallback="" /></span>
              <span className="truncate">{t(locale, "home.birthdayGacha")}</span>
            </a>
          )}
          {birthday.birthdayStoryAdvId ? (
            <a href={localizePath(entityLinkPath({ routeId: "story", detailId: birthday.birthdayStoryAdvId }), locale)} className="flex items-center rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-label-medium text-on-surface-variant hover:border-primary hover:text-primary">
              {t(locale, "home.birthdayStory")}
            </a>
          ) : null}
        </div>
      )}
    </li>
  );
}

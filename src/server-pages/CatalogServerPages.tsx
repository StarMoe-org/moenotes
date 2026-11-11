import BackgroundsExplorer from "@/components/backgrounds/BackgroundsExplorer";
import BandItemsExplorer from "@/components/band-items/BandItemsExplorer";
import CalendarView from "@/components/calendar/CalendarView";
import CardsExplorer from "@/components/cards/CardsExplorer";
import CharactersExplorer from "@/components/characters/CharactersExplorer";
import ComicsExplorer from "@/components/comics/ComicsExplorer";
import EventsExplorer from "@/components/events/EventsExplorer";
import ExchangeExplorer from "@/components/exchange/ExchangeExplorer";
import GachaExplorer from "@/components/gacha/GachaExplorer";
import HelpExplorer from "@/components/help/HelpExplorer";
import ItemsExplorer from "@/components/items/ItemsExplorer";
import MissionsExplorer from "@/components/missions/MissionsExplorer";
import MusicExplorer from "@/components/music/MusicExplorer";
import RealLivesView from "@/components/real-lives/RealLivesView";
import RewardsExplorer from "@/components/rewards/RewardsExplorer";
import RouteGlyph from "@/components/shared/RouteGlyph";
import PageHeader from "@/components/shell/PageHeader";
import ShopExplorer from "@/components/shop/ShopExplorer";
import SkillsExplorer from "@/components/skills/SkillsExplorer";
import StampsExplorer from "@/components/stamps/StampsExplorer";
import StoryExplorer from "@/components/story/StoryExplorer";
import { isReleaseFacetReleasedAcrossServers, isStoryReleasedAcrossServers, isStoryReleasedAt } from "@/lib/story/release";
import { getBuildReleasedCharacterIds } from "@/lib/characters/release";
import { valueForServer, type ServerFaceted, type ServerFacetedValue } from "@/lib/servers/facets";
import { inStorySection, type StorySection } from "@/lib/story/sections";
import SupportCardsExplorer from "@/components/support-cards/SupportCardsExplorer";
import TgwCardView from "@/components/tgw-card/TgwCardView";
import TitlesExplorer from "@/components/titles/TitlesExplorer";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { haneokaEngineDocument, haneokaUrl, siteConfig } from "@/config/site";
import { t } from "@/i18n";
import { getLegalTexts } from "@/i18n/legal";
import { localizePath } from "@/i18n/routing";
import { calendarDayAt, monthKey, monthOf } from "@/lib/calendar/model";
import { HANEOKA_COMMIT } from "@/lib/deck/haneoka/request";
import { getBuildArenaCatalogs } from "@/lib/masterdata/build-arena";
import { getBuildCalendar } from "@/lib/masterdata/build-calendar";
import { getBuildCardSkillNames } from "@/lib/masterdata/build-card-skill-names";
import { getBuildCatalogCounts, getBuildCatalogCovers } from "@/lib/masterdata/build-catalog";
import {
  getBuildBackgrounds,
  getBuildBandItems,
  getBuildBandNames,
  getBuildCards,
  getBuildCharacters,
  getBuildComics,
  getBuildDegrees,
  getBuildEvents,
  getBuildExchange,
  getBuildGachas,
  getBuildItems,
  getBuildMusic,
  getBuildRewardEntries,
  getBuildStamps,
  getBuildStories,
  getBuildStoryReaderLookup,
  getBuildSupportCards,
} from "@/lib/masterdata/build-data";
import { getBuildHelp } from "@/lib/masterdata/build-help";
import { getBuildLimitedMissionGroups, getBuildRegularMissions } from "@/lib/masterdata/build-missions";
import { getBuildMusicCategories } from "@/lib/masterdata/build-music";
import { getBuildProgressionReferences } from "@/lib/masterdata/build-progression";
import { getBuildRealLives } from "@/lib/masterdata/build-real-lives";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import { getBuildShops } from "@/lib/masterdata/build-shop";
import { getBuildSkillDictionaries } from "@/lib/masterdata/build-skill-dictionary";
import { getBuildTgwCard } from "@/lib/masterdata/build-vip";
import { getNavChildren } from "@/lib/route/registry";
import { MASTER_TIME_ZONE } from "@/lib/schedule";
import type { AppRoute } from "@/types/route";

function releasedFacets<T extends { startAt: string }>(entries: ServerFaceted<T>[], now: number): ServerFaceted<T>[] {
  return entries.filter((entry) => isReleaseFacetReleasedAcrossServers(entry, now));
}

function releasedCalendar<T extends { entries: Array<{ id: string; startAt: string }> }>(data: ServerFacetedValue<T>, now: number): ServerFacetedValue<T> {
  const datesByEntry = new Map<string, Map<GameServer, string>>();
  for (const server of data.servers) {
    for (const entry of valueForServer(data, server).entries) {
      const dates = datesByEntry.get(entry.id) ?? new Map<GameServer, string>();
      dates.set(server, entry.startAt);
      datesByEntry.set(entry.id, dates);
    }
  }
  const publicIds = new Set([...datesByEntry].flatMap(([id, dates]) =>
    dates.size > 0 && [...dates.values()].every((date) => isStoryReleasedAt(date, now)) ? [id] : [],
  ));
  const filter = (value: Partial<T>): Partial<T> => {
    const entries = value.entries;
    return Array.isArray(entries) ? { ...value, entries: entries.filter((entry) => publicIds.has(entry.id)) } as Partial<T> : value;
  };
  const serverVariants = Object.fromEntries(Object.entries(data.serverVariants ?? {}).map(([server, value]) => [server, filter(value)])) as ServerFacetedValue<T>["serverVariants"];
  return {
    value: filter(data.value) as T,
    servers: data.servers,
    ...(serverVariants && Object.keys(serverVariants).length > 0 ? { serverVariants } : {}),
  };
}

export async function CardsServerPage({ locale }: { locale: AppLocale }) {
  const [allCards, servers, skillNames] = await Promise.all([
    getBuildCards(locale),
    getBuildServers(),
    getBuildCardSkillNames(locale),
  ]);
  const cards = releasedFacets(allCards, Date.now());
  return (
    <PageHeader locale={locale} titleKey="seo.cards.title" descriptionKey="seo.cards.description">
      <CardsExplorer
        locale={locale}
        initialCards={cards}
        servers={servers}
        skillNames={skillNames}
      />
    </PageHeader>
  );
}

export async function SkillsServerPage({ locale }: { locale: AppLocale }) {
  const [allCards, bandNames, servers, skillDictionaries] = await Promise.all([
    getBuildCards(locale),
    getBuildBandNames(locale),
    getBuildServers(),
    getBuildSkillDictionaries(locale),
  ]);
  const cards = releasedFacets(allCards, Date.now());
  return (
    <PageHeader locale={locale} titleKey="seo.skills.title" descriptionKey="seo.skills.description">
      <SkillsExplorer
        locale={locale}
        servers={servers}
        initialCards={cards}
        bands={bandNames}
        skillDictionaries={skillDictionaries}
      />
    </PageHeader>
  );
}

export async function SupportCardsServerPage({ locale }: { locale: AppLocale }) {
  const [allCards, servers, skillNames] = await Promise.all([
    getBuildSupportCards(locale),
    getBuildServers(),
    getBuildCardSkillNames(locale),
  ]);
  const cards = releasedFacets(allCards, Date.now());
  return (
    <PageHeader locale={locale} titleKey="seo.supportCards.title" descriptionKey="seo.supportCards.description">
      <SupportCardsExplorer servers={servers} locale={locale} initialSupportCards={cards} skillNames={skillNames} />
    </PageHeader>
  );
}

export async function MusicServerPage({ locale }: { locale: AppLocale }) {
  const [allSongs, categories, servers] = await Promise.all([
    getBuildMusic(locale),
    getBuildMusicCategories(locale),
    getBuildServers(),
  ]);
  const songs = releasedFacets(allSongs, Date.now());
  const categoryNames: Array<[number, string]> = categories.map((category) => [category.id, category.name]);
  return (
    <PageHeader locale={locale} titleKey="seo.music.title" descriptionKey="seo.music.description">
      <MusicExplorer servers={servers} locale={locale} initialSongs={songs} categories={categoryNames} />
    </PageHeader>
  );
}

export async function CharactersServerPage({ locale }: { locale: AppLocale }) {
  const [allCharacters, servers] = await Promise.all([getBuildCharacters(locale), getBuildServers()]);
  const releasedCharacterIds = await getBuildReleasedCharacterIds(locale);
  const characters = {
    ...allCharacters,
    characters: allCharacters.characters.filter((character) => releasedCharacterIds.has(character.id)),
  };
  const releasedBandIds = new Set(characters.characters.map((character) => character.bandId));
  characters.bands = characters.bands.filter((band) => releasedBandIds.has(band.id));
  return (
    <PageHeader locale={locale} titleKey="seo.characters.title" descriptionKey="seo.characters.description">
      <CharactersExplorer servers={servers} locale={locale} initialCharacters={characters} />
    </PageHeader>
  );
}

export async function EventsServerPage({ locale }: { locale: AppLocale }) {
  const [allEvents, { characters, bands }, servers, arenaCatalogs, releasedCharacterIds] = await Promise.all([
    getBuildEvents(locale),
    getBuildCharacters(locale),
    getBuildServers(),
    getBuildArenaCatalogs(locale),
    getBuildReleasedCharacterIds(locale),
  ]);
  const events = releasedFacets(allEvents, Date.now());
  const publicBandIds = new Set(characters.filter((character) => releasedCharacterIds.has(character.id)).map((character) => character.bandId));
  const bandOptions: Array<[number, string]> = bands.filter((band) => publicBandIds.has(band.id)).map((band) => [band.id, band.name]);
  return (
    <PageHeader locale={locale} titleKey="seo.eventList.title" descriptionKey="seo.eventList.description">
      <EventsExplorer
        servers={servers}
        locale={locale}
        initialEvents={events}
        bands={bandOptions}
        arenaCatalogs={arenaCatalogs}
      />
    </PageHeader>
  );
}

export async function GachaServerPage({ locale }: { locale: AppLocale }) {
  const [allGachas, { characters, bands }, servers, releasedCharacterIds] = await Promise.all([
    getBuildGachas(locale),
    getBuildCharacters(locale),
    getBuildServers(),
    getBuildReleasedCharacterIds(locale),
  ]);
  const gachas = releasedFacets(allGachas, Date.now());
  const publicBandIds = new Set(characters.filter((character) => releasedCharacterIds.has(character.id)).map((character) => character.bandId));
  const bandOptions: Array<[number, string]> = bands.filter((band) => publicBandIds.has(band.id)).map((band) => [band.id, band.name]);
  return (
    <PageHeader locale={locale} titleKey="seo.gacha.title" descriptionKey="seo.gacha.description">
      <GachaExplorer servers={servers} locale={locale} initialGachas={gachas} bands={bandOptions} />
    </PageHeader>
  );
}

export async function CalendarServerPage({ locale }: { locale: AppLocale }) {
  const [calendar, { characters }, servers, releasedCharacterIds] = await Promise.all([
    getBuildCalendar(locale),
    getBuildCharacters(locale),
    getBuildServers(),
    getBuildReleasedCharacterIds(locale),
  ]);
  const now = Date.now();
  const data = releasedCalendar(calendar.data, now);
  const birthdays = calendar.birthdays.filter((birthday) => releasedCharacterIds.has(birthday.characterId));
  const characterOptions = characters
    .filter((character) => releasedCharacterIds.has(character.id))
    .map((character) => ({ id: character.id, name: character.name }));
  const buildMonth = monthKey(monthOf(calendarDayAt(now, MASTER_TIME_ZONE)));
  return (
    <PageHeader locale={locale} titleKey="seo.calendar.title" descriptionKey="seo.calendar.description">
      <CalendarView
        locale={locale}
        data={data}
        birthdays={birthdays}
        servers={servers}
        characters={characterOptions}
        buildMonth={buildMonth}
      />
    </PageHeader>
  );
}

export async function StoryServerPage({
  locale,
  category,
  titleKey,
  descriptionKey,
}: {
  locale: AppLocale;
  category: StorySection;
  titleKey: string;
  descriptionKey: string;
}) {
  const [allStories, readerLookup, servers, characterData] = await Promise.all([
    getBuildStories(locale),
    category === "main" || category === "event"
      ? getBuildStoryReaderLookup()
      : Promise.resolve({ characters: [], texts: [] }),
    getBuildServers(),
    // The event filter lists every band of the build, not only those an event chapter happens to use.
    category === "event" ? getBuildCharacters(locale) : Promise.resolve(null),
  ]);
  const now = Date.now();
  const stories = allStories.filter((story) => isStoryReleasedAcrossServers(story, now) && inStorySection(category, story));
  const releasedCharacterIds = new Set(stories.flatMap((story) => story.characterIds));
  const readerCharacters = readerLookup.characters.filter((character) => releasedCharacterIds.has(character.id));
  const readerTextIds = new Set(readerCharacters.flatMap((character) => [character.nameTextID, character.shortNameTextID]));
  const readerTexts = readerLookup.texts.filter((text) => readerTextIds.has(text.id));
  const bands: Array<[number, string]> = characterData ? characterData.bands.map((band) => [band.id, band.name]) : [];
  return (
    <PageHeader locale={locale} titleKey={titleKey} descriptionKey={descriptionKey}>
      <StoryExplorer
        locale={locale}
        servers={servers}
        bands={bands}
        initialCategory={category}
        initialStories={stories}
        initialCharacters={readerCharacters}
        initialTexts={readerTexts}
      />
    </PageHeader>
  );
}

export async function ItemsServerPage({ locale }: { locale: AppLocale }) {
  const [items, servers] = await Promise.all([getBuildItems(locale), getBuildServers()]);
  return (
    <PageHeader locale={locale} titleKey="seo.items.title" descriptionKey="seo.items.description">
      <ItemsExplorer servers={servers} locale={locale} initialItems={items} />
    </PageHeader>
  );
}

export async function BandItemsServerPage({ locale }: { locale: AppLocale }) {
  const [bandItems, bandNames, servers] = await Promise.all([
    getBuildBandItems(locale),
    getBuildBandNames(locale),
    getBuildServers(),
  ]);
  return (
    <PageHeader locale={locale} titleKey="seo.bandItems.title" descriptionKey="seo.bandItems.description">
      <BandItemsExplorer servers={servers} locale={locale} initialItems={bandItems} initialBandNames={bandNames} />
    </PageHeader>
  );
}

export async function StampsServerPage({ locale }: { locale: AppLocale }) {
  const [allStamps, bandNames, servers] = await Promise.all([
    getBuildStamps(locale),
    getBuildBandNames(locale),
    getBuildServers(),
  ]);
  const stamps = releasedFacets(allStamps, Date.now());
  return (
    <PageHeader locale={locale} titleKey="seo.stamps.title" descriptionKey="seo.stamps.description">
      <StampsExplorer servers={servers} locale={locale} initialStamps={stamps} initialBandNames={bandNames} />
    </PageHeader>
  );
}

export async function ComicsServerPage({ locale }: { locale: AppLocale }) {
  const [allComics, bandNames, servers] = await Promise.all([
    getBuildComics(locale),
    getBuildBandNames(locale),
    getBuildServers(),
  ]);
  const comics = releasedFacets(allComics, Date.now());
  return (
    <PageHeader locale={locale} titleKey="seo.comics.title" descriptionKey="seo.comics.description">
      <ComicsExplorer servers={servers} locale={locale} initialComics={comics} initialBandNames={bandNames} />
    </PageHeader>
  );
}

export async function TitlesServerPage({ locale }: { locale: AppLocale }) {
  const [allTitles, { characters, bands }, servers, releasedCharacterIds] = await Promise.all([
    getBuildDegrees(locale),
    getBuildCharacters(locale),
    getBuildServers(),
    getBuildReleasedCharacterIds(locale),
  ]);
  const titles = releasedFacets(allTitles, Date.now());
  const publicCharacters = characters.filter((character) => releasedCharacterIds.has(character.id));
  const publicBandIds = new Set(publicCharacters.map((character) => character.bandId));
  const bandOptions: Array<[number, string]> = bands.filter((band) => publicBandIds.has(band.id)).map((band) => [band.id, band.name]);
  const characterOptions = publicCharacters.map((character) => ({ id: character.id, name: character.name, bandId: character.bandId }));
  return (
    <PageHeader locale={locale} titleKey="seo.titles.title" descriptionKey="seo.titles.description">
      <TitlesExplorer servers={servers} locale={locale} initialTitles={titles} bands={bandOptions} characters={characterOptions} />
    </PageHeader>
  );
}

export async function BackgroundsServerPage({ locale }: { locale: AppLocale }) {
  const [backgrounds, servers] = await Promise.all([getBuildBackgrounds(locale), getBuildServers()]);
  return (
    <PageHeader locale={locale} titleKey="seo.backgrounds.title" descriptionKey="seo.backgrounds.description">
      <BackgroundsExplorer servers={servers} locale={locale} initialBackgrounds={backgrounds} />
    </PageHeader>
  );
}

export async function ExchangeServerPage({ locale }: { locale: AppLocale }) {
  const [categories, servers] = await Promise.all([getBuildExchange(locale), getBuildServers()]);
  return (
    <PageHeader locale={locale} titleKey="seo.exchange.title" descriptionKey="seo.exchange.description">
      <ExchangeExplorer servers={servers} locale={locale} initialCategories={categories} />
    </PageHeader>
  );
}

export async function RewardsServerPage({ locale }: { locale: AppLocale }) {
  const [allEntries, servers] = await Promise.all([getBuildRewardEntries(locale), getBuildServers()]);
  const entries = releasedFacets(allEntries, Date.now());
  return (
    <PageHeader locale={locale} titleKey="seo.rewards.title" descriptionKey="seo.rewards.description">
      <RewardsExplorer servers={servers} locale={locale} initialEntries={entries} />
    </PageHeader>
  );
}

export async function ShopServerPage({ locale }: { locale: AppLocale }) {
  const [allShops, servers] = await Promise.all([getBuildShops(locale), getBuildServers()]);
  const shops = releasedFacets(allShops, Date.now());
  return (
    <PageHeader locale={locale} titleKey="seo.shop.title" descriptionKey="seo.shop.description">
      <ShopExplorer servers={servers} locale={locale} initialShops={shops} />
    </PageHeader>
  );
}

export async function MissionsServerPage({ locale }: { locale: AppLocale }) {
  const [categories, limitedGroups, servers] = await Promise.all([
    getBuildRegularMissions(locale),
    getBuildLimitedMissionGroups(locale),
    getBuildServers(),
  ]);
  return (
    <PageHeader locale={locale} titleKey="seo.missions.title" descriptionKey="seo.missions.description">
      <MissionsExplorer servers={servers} locale={locale} categories={categories} limitedGroups={limitedGroups} />
    </PageHeader>
  );
}

export async function TgwCardServerPage({ locale }: { locale: AppLocale }) {
  const [card, servers] = await Promise.all([getBuildTgwCard(locale), getBuildServers()]);
  return (
    <PageHeader locale={locale} titleKey="seo.tgwCard.title" descriptionKey="seo.tgwCard.description">
      <TgwCardView servers={servers} locale={locale} card={card} />
    </PageHeader>
  );
}

export async function RealLivesServerPage({ locale }: { locale: AppLocale }) {
  const [lives, servers] = await Promise.all([getBuildRealLives(locale), getBuildServers()]);
  return (
    <PageHeader locale={locale} titleKey="seo.realLives.title" descriptionKey="seo.realLives.description">
      <RealLivesView servers={servers} locale={locale} lives={lives} />
    </PageHeader>
  );
}

export async function HelpServerPage({ locale }: { locale: AppLocale }) {
  const [help, servers, progressionByServer] = await Promise.all([
    getBuildHelp(locale),
    getBuildServers(),
    getBuildProgressionReferences(),
  ]);
  return (
    <PageHeader locale={locale} titleKey="seo.help.title" descriptionKey="seo.help.description">
      <HelpExplorer
        locale={locale}
        servers={servers}
        categories={help.categories}
        topics={help.topics}
        tips={help.tips}
        faq={help.faq}
        progressionByServer={progressionByServer}
      />
    </PageHeader>
  );
}

export async function GroupLandingServerPage({
  locale,
  group,
  isGroupLanding,
}: {
  locale: AppLocale;
  group: AppRoute;
  isGroupLanding: boolean;
}) {
  if (!isGroupLanding) {
    return <PageHeader locale={locale} titleKey={group.seo.titleKey} descriptionKey={group.seo.descriptionKey} />;
  }
  const children = getNavChildren(group);
  const [counts, covers] = await Promise.all([getBuildCatalogCounts(locale), getBuildCatalogCovers(locale)]);
  const pictured = children.filter((item) => covers[item.id]);
  const listed = children.filter((item) => !covers[item.id]);

  return (
    <PageHeader locale={locale} titleKey={group.seo.titleKey} descriptionKey={group.seo.descriptionKey}>
      <section>
        {t(locale, "page.groupIntro") ? (
          <p className="mb-6 max-w-3xl text-body-large text-on-surface-variant">{t(locale, "page.groupIntro")}</p>
        ) : null}
        {pictured.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-3 2xl:grid-cols-4">
            {pictured.map((item) => {
              const cover = covers[item.id]!;
              const count = counts[item.id];
              return (
                <li key={item.id} className="min-w-0">
                  <a href={localizePath(item.path, locale)} className="mn-hub-tile group block rounded-shape-lg">
                    <span className="mn-hub-cover relative block aspect-video overflow-hidden rounded-shape-lg bg-surface-container-high">
                      <img
                        src={cover.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className={
                          cover.fit === "contain"
                            ? "absolute inset-0 m-auto max-h-full max-w-full object-contain p-6"
                            : "h-full w-full object-cover object-[50%_25%]"
                        }
                      />
                    </span>
                    <span className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 px-1 sm:mt-3">
                      <h2 className="min-w-0 truncate text-title-medium text-on-surface group-hover:text-primary sm:text-title-large">
                        {t(locale, item.labelKey)}
                      </h2>
                      {count ? (
                        <span className="shrink-0 text-label-large tabular-nums text-on-surface-variant">
                          {t(locale, "filter.total", { total: count.toLocaleString(locale) })}
                        </span>
                      ) : null}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
        {listed.length > 0 ? (
          <ul className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${pictured.length > 0 ? "mt-10" : ""}`}>
            {listed.map((item) => (
              <li key={item.id} className="min-w-0">
                <a
                  href={localizePath(item.path, locale)}
                  className="md3-state flex h-full items-start gap-4 rounded-shape-lg bg-surface-container-low p-4"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
                    <RouteGlyph icon={item.nav && item.nav.icon ? item.nav.icon : "sparkles"} routeId={item.id} className="h-6 w-6" />
                  </span>
                  <span className="min-w-0">
                    <h2 className="text-title-medium text-on-surface">{t(locale, item.labelKey)}</h2>
                    <p className="mt-1 line-clamp-2 text-body-medium text-on-surface-variant">{t(locale, item.seo.descriptionKey)}</p>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </PageHeader>
  );
}

export function LegalServerPage({
  locale,
  document,
}: {
  locale: AppLocale;
  document: "license" | "terms" | "privacy";
}) {
  const texts = getLegalTexts(locale);
  const doc = texts.documents[document];
  const updated = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(Date.parse(`${texts.updated}T00:00:00Z`));
  const repo = siteConfig.repository ?? "";
  const parts = (text: string) => text.split("{repo}");

  return (
    <PageHeader locale={locale} titleKey={`seo.${document}.title`} descriptionKey={`seo.${document}.description`}>
      <article className="md3-surface max-w-4xl p-5 sm:p-8">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-small text-on-surface-variant">
          <time dateTime={texts.updated}>{texts.updatedLabel.replace("{date}", updated)}</time>
          <span className="opacity-70">{texts.draftNotice}</span>
        </p>
        <div className="mt-6 space-y-8">
          {doc.sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-[var(--md-ref-typeface-brand)] text-title-large text-on-surface">{section.title}</h2>
              {section.paragraphs?.map((paragraph, pIdx) => (
                <p key={pIdx} className="mt-3 text-body-medium leading-7 text-on-surface-variant">
                  {parts(paragraph).map((chunk, index) => (
                    <span key={index}>
                      {index > 0 && repo && (
                        <a
                          href={repo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all font-bold text-primary underline underline-offset-4"
                        >
                          {repo}
                        </a>
                      )}
                      {chunk}
                    </span>
                  ))}
                </p>
              ))}
              {section.items && (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-body-medium leading-7 text-on-surface-variant">
                  {section.items.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        {document === "license" && (
          <p className="mt-6 text-body-medium leading-7 text-on-surface-variant">
            {t(locale, "deckWorkspace.solver.haneokaAttribution")} —{" "}
            <a href={haneokaUrl} className="text-primary underline">
              {haneokaUrl}
            </a>
            {" · AGPL-3.0-only · "}
            <a href={haneokaEngineDocument(HANEOKA_COMMIT, "LICENSE")} className="text-primary underline">
              LICENSE
            </a>
            {" · "}
            <a href={haneokaEngineDocument(HANEOKA_COMMIT, "NOTICE")} className="text-primary underline">
              NOTICE
            </a>
          </p>
        )}
      </article>
    </PageHeader>
  );
}

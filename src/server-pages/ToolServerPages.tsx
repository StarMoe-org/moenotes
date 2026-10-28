import "@/styles/deck-workspace.css";
import "@/styles/guess-music.css";
import ChartDataTool from "@/components/chart-data/ChartDataTool";
import GuideView from "@/components/chart-data/GuideView";
import DeckWorkspace from "@/components/deck/DeckWorkspace";
import DesignSystemPage from "@/components/design-system/DesignSystemPage";
import EventTracker, { type TrackerSong } from "@/components/events/EventTracker";
import GuessMusicTool from "@/components/guess-music/GuessMusicTool";
import NewsDetail from "@/components/news/NewsDetail";
import NewsExplorer from "@/components/news/NewsExplorer";
import SearchPage from "@/components/search/SearchPage";
import PageHeader from "@/components/shell/PageHeader";
import AssetViewer from "@/components/tools/AssetViewer";
import ChartPreview3D from "@/components/tools/ChartPreview3D";
import Live2DViewer from "@/components/tools/Live2DViewer";
import MusicRankingTool from "@/components/tools/MusicRankingTool";
import StoryPlayerTool from "@/components/tools/StoryPlayerTool";
import type { AppLocale } from "@/config/locales";
import { PRIMARY_SERVER } from "@/config/servers";
import { t } from "@/i18n";
import { getChartDataGuide } from "@/i18n/guides/chart-data";
import { getDeckGuide } from "@/i18n/guides/deck";
import { localizePath } from "@/i18n/routing";
import {
  getBuildCards,
  getBuildCharacters,
  getBuildDeckArenas,
  getBuildDeckCardLookup,
  getBuildDeckEvents,
  getBuildEvents,
  getBuildMusic,
  getBuildStories,
  getBuildSupportCards,
} from "@/lib/masterdata/build-data";
import { getBuildGuessSongs } from "@/lib/masterdata/build-guess-music";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import { getBuildThemeBands } from "@/lib/masterdata/build-settings";
import { getBuildPlayerCatalogue } from "@/lib/masterdata/player-fields";
import { getBuildRecognitionSource } from "@/lib/masterdata/recognition-source";
import { getBuildGameSaveTables } from "@/lib/masterdata/save-tables";
import { getRoutePathById } from "@/lib/route/registry";
import { storyEpisodeLabel } from "@/lib/story/labels";
import type { StoryPickerStory } from "@/lib/story/player-data";

export async function DeckWorkspaceServerPage({
  locale,
  page,
}: {
  locale: AppLocale;
  page: "deck" | "box";
}) {
  const [members, snaps, songs, servers, deckEvents, deckArenas] = await Promise.all([
    getBuildCards(locale),
    getBuildSupportCards(locale),
    getBuildMusic(locale),
    getBuildServers(),
    getBuildDeckEvents(locale),
    getBuildDeckArenas(),
  ]);
  const [playerCatalogues, recognitionSources, saveTables] = await Promise.all([
    Promise.all(servers.map(getBuildPlayerCatalogue)).then((list) => list.filter((value) => value !== null)),
    Promise.all(servers.map(getBuildRecognitionSource)).then((list) => list.filter((value) => value !== null)),
    Promise.all(servers.map(getBuildGameSaveTables)).then((list) => list.filter((value) => value !== null)),
  ]);
  return (
    <DeckWorkspace
      locale={locale}
      page={page}
      members={members}
      snaps={snaps}
      songs={songs}
      servers={servers}
      playerCatalogues={playerCatalogues}
      recognitionSources={recognitionSources}
      saveTables={saveTables}
      deckEvents={deckEvents}
      deckArenas={deckArenas}
    />
  );
}

export function DeckGuideServerPage({ locale }: { locale: AppLocale }) {
  const guide = getDeckGuide(locale);
  const badge = (
    <a
      href={localizePath(getRoutePathById("deck"), locale)}
      className="rounded-full border border-outline-variant px-2 py-0.5 text-body-small text-on-surface-variant"
    >
      {t(locale, "deckWorkspace.title")}
    </a>
  );
  return (
    <PageHeader
      locale={locale}
      titleKey="deckWorkspace.deckGuide.title"
      descriptionKey="deckWorkspace.deckGuide.description"
      showDescription={false}
      titleBadge={badge}
    >
      <div className="mn-cd">
        <div className="mn-cd-main">
          <GuideView guide={guide} />
        </div>
      </div>
    </PageHeader>
  );
}

export async function DesignSystemServerPage({ locale }: { locale: AppLocale }) {
  const bands = await getBuildThemeBands(locale);
  return <DesignSystemPage locale={locale} bands={bands} />;
}

export function AssetViewerServerPage({ locale }: { locale: AppLocale }) {
  return (
    <PageHeader locale={locale} titleKey="seo.assetViewer.title" descriptionKey="seo.assetViewer.description">
      <AssetViewer locale={locale} />
    </PageHeader>
  );
}

export async function ChartPreview3DServerPage({ locale }: { locale: AppLocale }) {
  const songs = await getBuildMusic(locale);
  return (
    <PageHeader locale={locale} titleKey="seo.chartPreview.title" descriptionKey="seo.chartPreview.description">
      <ChartPreview3D locale={locale} songs={songs} />
    </PageHeader>
  );
}

export async function Live2DViewerServerPage({ locale }: { locale: AppLocale }) {
  const { characters, bands } = await getBuildCharacters(locale);
  const pickerCharacters = characters.map((character) => ({
    id: character.id,
    name: character.name,
    bandId: character.bandId,
  }));
  const pickerBands = [...bands].sort((a, b) => a.id - b.id).map((band) => ({ id: band.id, name: band.name }));
  return (
    <PageHeader locale={locale} titleKey="seo.live2dViewer.title" descriptionKey="seo.live2dViewer.description">
      <Live2DViewer locale={locale} characters={pickerCharacters} bands={pickerBands} />
    </PageHeader>
  );
}

export async function StoryPlayerServerPage({ locale }: { locale: AppLocale }) {
  const stories: StoryPickerStory[] = (await getBuildStories(locale)).map((story) => ({
    advId: story.advId,
    assetServer: story.servers[0] ?? PRIMARY_SERVER,
    category: story.category,
    title: story.title,
    groupId: story.groupId,
    groupTitle: story.groupTitle || story.bandName,
    groupSubtitle: story.category === "main" || story.category === "event" ? story.bandName : "",
    groupImage:
      (story.category === "main" || story.category === "event") && (story.chapterBanner || story.chapterImage)
        ? `Story/${story.chapterBanner ? "Banner" : "Image"}/Chapter/${story.chapterBanner || story.chapterImage}`
        : "",
    episodeLabel: storyEpisodeLabel(locale, story),
    episodeKind: story.episodeKind,
    episodeNote: story.episodeKind === "another" ? (story.characterNames[0] ?? "") : "",
    image:
      (story.category === "main" || story.category === "event" || story.category === "friendship") &&
      (story.assets.banner || story.assets.image)
        ? `Story/Banner/${story.assets.banner ? "Episode" : "Chapter"}/${story.assets.banner || story.assets.image}`
        : "",
    searchText: story.searchText,
    startAt: story.startAt,
  }));

  return (
    <PageHeader locale={locale} titleKey="seo.storyPlayer.title" descriptionKey="seo.storyPlayer.description">
      <StoryPlayerTool locale={locale} stories={stories} />
    </PageHeader>
  );
}

export async function GuessMusicServerPage({ locale }: { locale: AppLocale }) {
  const [songs, servers] = await Promise.all([getBuildGuessSongs(locale), getBuildServers()]);
  return (
    <PageHeader locale={locale} titleKey="seo.guessMusic.title" descriptionKey="seo.guessMusic.description">
      <GuessMusicTool locale={locale} songs={songs} servers={servers} />
    </PageHeader>
  );
}

export async function MusicRankingServerPage({ locale }: { locale: AppLocale }) {
  const [songs, deckCards] = await Promise.all([getBuildMusic(locale), getBuildDeckCardLookup(locale)]);
  return (
    <PageHeader locale={locale} titleKey="seo.musicRanking.title" descriptionKey="seo.musicRanking.description">
      <MusicRankingTool locale={locale} songs={songs} deckCards={deckCards} />
    </PageHeader>
  );
}

export function ChartDataServerPage({ locale, localizedPathname }: { locale: AppLocale; localizedPathname: string }) {
  const guide = getChartDataGuide(locale);
  const badge = (
    <a
      href={`${localizedPathname}?v=guide`}
      className="rounded-full border border-outline-variant px-2 py-0.5 text-body-small text-on-surface-variant"
      title={t(locale, "chartData.betaHint")}
    >
      {t(locale, "chartData.beta")}
    </a>
  );
  return (
    <PageHeader
      locale={locale}
      titleKey="seo.chartData.title"
      descriptionKey="seo.chartData.description"
      showDescription={false}
      titleBadge={badge}
    >
      <ChartDataTool locale={locale} guide={guide} />
    </PageHeader>
  );
}

export async function EventTrackerServerPage({ locale }: { locale: AppLocale }) {
  const [events, music, deckCards, servers] = await Promise.all([
    getBuildEvents(locale),
    getBuildMusic(locale),
    getBuildDeckCardLookup(locale),
    getBuildServers(),
  ]);
  const songs: Record<string, TrackerSong> = Object.fromEntries(
    music.map((song) => [
      String(song.id),
      { title: song.title, jacketUrl: song.jacketUrl, bandName: song.bandName, servers: song.servers },
    ]),
  );
  return (
    <PageHeader locale={locale} titleKey="seo.eventTracker.title" descriptionKey="seo.eventTracker.description">
      <EventTracker locale={locale} events={events} songs={songs} deckCards={deckCards} servers={servers} />
    </PageHeader>
  );
}

export function NewsServerPage({ locale }: { locale: AppLocale }) {
  return (
    <PageHeader locale={locale} titleKey="seo.news.title" descriptionKey="seo.news.description">
      <NewsExplorer locale={locale} />
    </PageHeader>
  );
}

export function NewsDetailServerPage({ locale }: { locale: AppLocale }) {
  return (
    <PageHeader locale={locale} titleKey="seo.newsDetail.title" descriptionKey="seo.newsDetail.description">
      <NewsDetail locale={locale} />
    </PageHeader>
  );
}

export function SearchServerPage({
  locale,
  titleKey,
  descriptionKey,
}: {
  locale: AppLocale;
  titleKey: string;
  descriptionKey: string;
}) {
  return (
    <PageHeader locale={locale} titleKey={titleKey} descriptionKey={descriptionKey}>
      <SearchPage locale={locale} />
    </PageHeader>
  );
}

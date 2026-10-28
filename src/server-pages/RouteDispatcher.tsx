import BreadcrumbSync from "@/components/shell/BreadcrumbSync";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import type { DetailSemanticSeoData } from "@/lib/seo/entity-seo";
import AboutServerPage from "@/server-pages/AboutServerPage";
import { AccountServerPage, OpenPlatformDocsServerPage, OpenPlatformServerPage, PlayerServerPage } from "@/server-pages/AccountServerPages";
import {
  BackgroundsServerPage,
  BandItemsServerPage,
  CalendarServerPage,
  CardsServerPage,
  CharactersServerPage,
  ComicsServerPage,
  EventsServerPage,
  ExchangeServerPage,
  GachaServerPage,
  GroupLandingServerPage,
  HelpServerPage,
  ItemsServerPage,
  LegalServerPage,
  MissionsServerPage,
  MusicServerPage,
  RealLivesServerPage,
  RewardsServerPage,
  ShopServerPage,
  StampsServerPage,
  StoryServerPage,
  SupportCardsServerPage,
  TgwCardServerPage,
  TitlesServerPage,
} from "@/server-pages/CatalogServerPages";
import {
  CardDetailServerPage,
  CharacterDetailServerPage,
  EventDetailServerPage,
  ExchangeDetailServerPage,
  GachaDetailServerPage,
  HelpDetailServerPage,
  ItemDetailServerPage,
  MusicDetailServerPage,
  RewardDetailServerPage,
  ShopDetailServerPage,
  StoryDetailServerPage,
  SupportCardDetailServerPage,
} from "@/server-pages/DetailServerPages";
import HomeServerPage from "@/server-pages/HomeServerPage";
import {
  AssetViewerServerPage,
  ChartDataServerPage,
  ChartPreview3DServerPage,
  DeckGuideServerPage,
  DeckWorkspaceServerPage,
  DesignSystemServerPage,
  EventTrackerServerPage,
  GuessMusicServerPage,
  Live2DViewerServerPage,
  MusicRankingServerPage,
  NewsDetailServerPage,
  NewsServerPage,
  SearchServerPage,
  StoryPlayerServerPage,
} from "@/server-pages/ToolServerPages";
import type { findRouteMatch } from "@/lib/route/registry";

type NonNullRouteMatch = NonNullable<ReturnType<typeof findRouteMatch>>;

export default async function RouteDispatcher({
  locale,
  pathname,
  match,
  semantic,
}: {
  locale: AppLocale;
  pathname: string;
  match: NonNullRouteMatch;
  semantic?: DetailSemanticSeoData | undefined;
}) {
  const component = match.item.component ?? "page";
  const paramId = match.params.id ?? "";

  switch (component) {
    case "home":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <HomeServerPage locale={locale} />
        </>
      );
    case "about":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <AboutServerPage locale={locale} />
        </>
      );
    case "cards":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <CardsServerPage locale={locale} />
        </>
      );
    case "card-detail":
      return <CardDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "support-cards":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <SupportCardsServerPage locale={locale} />
        </>
      );
    case "support-card-detail":
      return <SupportCardDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "characters":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <CharactersServerPage locale={locale} />
        </>
      );
    case "character-detail":
      return <CharacterDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "music":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <MusicServerPage locale={locale} />
        </>
      );
    case "song-detail":
      return <MusicDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "event-list":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <EventsServerPage locale={locale} />
        </>
      );
    case "event-detail":
      return <EventDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "gacha":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <GachaServerPage locale={locale} />
        </>
      );
    case "gacha-detail":
      return <GachaDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "calendar":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <CalendarServerPage locale={locale} />
        </>
      );
    case "story-main":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <StoryServerPage locale={locale} category="main" titleKey={match.item.seo.titleKey} descriptionKey={match.item.seo.descriptionKey} />
        </>
      );
    case "story-event":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <StoryServerPage locale={locale} category="event" titleKey={match.item.seo.titleKey} descriptionKey={match.item.seo.descriptionKey} />
        </>
      );
    case "story-friendship":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <StoryServerPage locale={locale} category="friendship" titleKey={match.item.seo.titleKey} descriptionKey={match.item.seo.descriptionKey} />
        </>
      );
    case "story-birthday":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <StoryServerPage locale={locale} category="birthday" titleKey="seo.birthdayStory.title" descriptionKey="seo.birthdayStory.description" />
        </>
      );
    case "story-other":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <StoryServerPage locale={locale} category="other" titleKey={match.item.seo.titleKey} descriptionKey={match.item.seo.descriptionKey} />
        </>
      );
    case "story-detail":
      return <StoryDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "items":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <ItemsServerPage locale={locale} />
        </>
      );
    case "item-detail":
      return <ItemDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "band-items":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <BandItemsServerPage locale={locale} />
        </>
      );
    case "stamps":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <StampsServerPage locale={locale} />
        </>
      );
    case "comics":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <ComicsServerPage locale={locale} />
        </>
      );
    case "titles":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <TitlesServerPage locale={locale} />
        </>
      );
    case "backgrounds":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <BackgroundsServerPage locale={locale} />
        </>
      );
    case "exchange":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <ExchangeServerPage locale={locale} />
        </>
      );
    case "exchange-detail":
      return <ExchangeDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "rewards":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <RewardsServerPage locale={locale} />
        </>
      );
    case "reward-detail":
      return <RewardDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "shop":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <ShopServerPage locale={locale} />
        </>
      );
    case "shop-detail":
      return <ShopDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "missions":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <MissionsServerPage locale={locale} />
        </>
      );
    case "tgw-card":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <TgwCardServerPage locale={locale} />
        </>
      );
    case "real-lives":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <RealLivesServerPage locale={locale} />
        </>
      );
    case "help":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <HelpServerPage locale={locale} />
        </>
      );
    case "help-detail":
      return <HelpDetailServerPage locale={locale} pathname={pathname} paramId={paramId} semantic={semantic} />;
    case "deck":
    case "card-box":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <DeckWorkspaceServerPage locale={locale} page={component === "deck" ? "deck" : "box"} />
        </>
      );
    case "deck-guide":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <DeckGuideServerPage locale={locale} />
        </>
      );
    case "design-system":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <DesignSystemServerPage locale={locale} />
        </>
      );
    case "asset-viewer":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <AssetViewerServerPage locale={locale} />
        </>
      );
    case "chart-preview":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <ChartPreview3DServerPage locale={locale} />
        </>
      );
    case "live2d-viewer":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <Live2DViewerServerPage locale={locale} />
        </>
      );
    case "story-player":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <StoryPlayerServerPage locale={locale} />
        </>
      );
    case "guess-music":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <GuessMusicServerPage locale={locale} />
        </>
      );
    case "music-ranking":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <MusicRankingServerPage locale={locale} />
        </>
      );
    case "chart-data":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <ChartDataServerPage locale={locale} localizedPathname={localizePath(pathname, locale)} />
        </>
      );
    case "event-tracker":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <EventTrackerServerPage locale={locale} />
        </>
      );
    case "news":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <NewsServerPage locale={locale} />
        </>
      );
    case "news-detail":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <NewsDetailServerPage locale={locale} />
        </>
      );
    case "search":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <SearchServerPage locale={locale} titleKey={match.item.seo.titleKey} descriptionKey={match.item.seo.descriptionKey} />
        </>
      );
    case "account":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <AccountServerPage locale={locale} />
        </>
      );
    case "player":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <PlayerServerPage locale={locale} />
        </>
      );
    case "open-platform":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <OpenPlatformServerPage locale={locale} />
        </>
      );
    case "open-platform-docs":
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <OpenPlatformDocsServerPage locale={locale} />
        </>
      );
    case "legal": {
      const docKey = match.item.id === "license" || match.item.id === "terms" || match.item.id === "privacy" ? match.item.id : "license";
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <LegalServerPage locale={locale} document={docKey} />
        </>
      );
    }
    default:
      return (
        <>
          <BreadcrumbSync locale={locale} pathname={pathname} />
          <GroupLandingServerPage locale={locale} group={match.item} isGroupLanding={match.isGroupLanding} />
        </>
      );
  }
}

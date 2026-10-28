import CardDetail from "@/components/cards/CardDetail";
import CharacterDetail from "@/components/characters/CharacterDetail";
import EventDetail from "@/components/events/EventDetail";
import ExchangeDetail from "@/components/exchange/ExchangeDetail";
import GachaDetail from "@/components/gacha/GachaDetail";
import HelpDetail from "@/components/help/HelpDetail";
import ItemDetail from "@/components/items/ItemDetail";
import MusicDetail from "@/components/music/MusicDetail";
import RewardDetail from "@/components/rewards/RewardDetail";
import DetailSemanticSeoShell from "@/components/seo/DetailSemanticSeoShell";
import BreadcrumbSync from "@/components/shell/BreadcrumbSync";
import ShopDetail from "@/components/shop/ShopDetail";
import StoryDetail from "@/components/story/StoryDetail";
import SupportCardDetail from "@/components/support-cards/SupportCardDetail";
import type { AppLocale } from "@/config/locales";
import { getBuildMemberCardMaterials, getBuildSupportCardMaterials } from "@/lib/masterdata/build-card-materials";
import { getBuildCharacterExtras } from "@/lib/masterdata/build-character-extras";
import {
  getBuildCardDetail,
  getBuildCharacterDetail,
  getBuildCharacterProgression,
  getBuildEventDetail,
  getBuildExchangeDetail,
  getBuildGachaDetail,
  getBuildMusicDetail,
  getBuildMusicDetailData,
  getBuildRewardEntryDetail,
  getBuildStoryDetail,
  getBuildSupportCardDetail,
} from "@/lib/masterdata/build-data";
import { getBuildHelpTopicDetail } from "@/lib/masterdata/build-help";
import { getBuildItemDetail, getBuildItemNeighbors } from "@/lib/masterdata/build-item-sources";
import { getBuildMusicLiveExtras } from "@/lib/masterdata/build-music";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import { getBuildShopDetail, getBuildShopNeighbors } from "@/lib/masterdata/build-shop";
import { getDetailBreadcrumb } from "@/lib/route/static-paths";
import type { DetailSemanticSeoData } from "@/lib/seo/entity-seo";

interface DetailPageContext {
  locale: AppLocale;
  pathname: string;
  paramId: string;
  semantic?: DetailSemanticSeoData | undefined;
}

export async function CardDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const cardId = Number(paramId);
  const [initialData, materials, servers, breadcrumb] = await Promise.all([
    getBuildCardDetail(locale, cardId),
    getBuildMemberCardMaterials(locale, cardId),
    getBuildServers(),
    getDetailBreadcrumb("card-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <CardDetail servers={servers} locale={locale} cardId={cardId} initialData={initialData} materials={materials} />
    </>
  );
}

export async function SupportCardDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const supportCardId = Number(paramId);
  const [initialData, materials, servers, breadcrumb] = await Promise.all([
    getBuildSupportCardDetail(locale, supportCardId),
    getBuildSupportCardMaterials(locale, supportCardId),
    getBuildServers(),
    getDetailBreadcrumb("support-card-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <SupportCardDetail servers={servers} locale={locale} supportCardId={supportCardId} initialData={initialData} materials={materials} />
    </>
  );
}

export async function CharacterDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const characterId = Number(paramId);
  const [initialData, progressionData, extrasData, servers, breadcrumb] = await Promise.all([
    getBuildCharacterDetail(locale, characterId),
    getBuildCharacterProgression(locale, characterId),
    getBuildCharacterExtras(locale, characterId),
    getBuildServers(),
    getDetailBreadcrumb("character-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <CharacterDetail
        servers={servers}
        locale={locale}
        characterId={characterId}
        initialData={initialData}
        progressionData={progressionData}
        extrasData={extrasData}
      />
    </>
  );
}

export async function MusicDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const songId = Number(paramId);
  const [song, detail, extras, servers, breadcrumb] = await Promise.all([
    getBuildMusicDetail(locale, songId),
    getBuildMusicDetailData(locale, songId),
    getBuildMusicLiveExtras(locale, songId),
    getBuildServers(),
    getDetailBreadcrumb("song-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <MusicDetail
        servers={servers}
        locale={locale}
        songId={songId}
        initialSong={song}
        liveDetail={detail?.value ?? null}
        liveExtras={extras}
      />
    </>
  );
}

export async function EventDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const eventId = Number(paramId);
  const [event, servers, breadcrumb] = await Promise.all([
    getBuildEventDetail(locale, eventId),
    getBuildServers(),
    getDetailBreadcrumb("event-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <EventDetail servers={servers} locale={locale} event={event} />
    </>
  );
}

export async function GachaDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const gachaId = Number(paramId);
  const [gacha, servers, breadcrumb] = await Promise.all([
    getBuildGachaDetail(locale, gachaId),
    getBuildServers(),
    getDetailBreadcrumb("gacha-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <GachaDetail servers={servers} locale={locale} gacha={gacha} />
    </>
  );
}

export async function ExchangeDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const exchangeId = Number(paramId);
  const [exchange, servers, breadcrumb] = await Promise.all([
    getBuildExchangeDetail(locale, exchangeId),
    getBuildServers(),
    getDetailBreadcrumb("exchange-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <ExchangeDetail servers={servers} locale={locale} exchange={exchange} />
    </>
  );
}

export async function RewardDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const [entry, servers, breadcrumb] = await Promise.all([
    getBuildRewardEntryDetail(locale, paramId),
    getBuildServers(),
    getDetailBreadcrumb("reward-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <RewardDetail servers={servers} locale={locale} entry={entry} />
    </>
  );
}

export async function ItemDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const itemId = Number(paramId);
  const [detail, neighbors, servers, breadcrumb] = await Promise.all([
    getBuildItemDetail(locale, itemId),
    getBuildItemNeighbors(locale),
    getBuildServers(),
    getDetailBreadcrumb("item-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <ItemDetail servers={servers} locale={locale} detail={detail} neighbors={neighbors.get(itemId) ?? {}} />
    </>
  );
}

export async function ShopDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const shopId = Number(paramId);
  const [shop, neighbors, servers, breadcrumb] = await Promise.all([
    getBuildShopDetail(locale, shopId),
    getBuildShopNeighbors(locale),
    getBuildServers(),
    getDetailBreadcrumb("shop-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <ShopDetail servers={servers} locale={locale} shop={shop} neighbors={neighbors.get(shopId)} />
    </>
  );
}

export async function HelpDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const helpId = Number(paramId);
  const [detail, servers, breadcrumb] = await Promise.all([
    getBuildHelpTopicDetail(locale, helpId),
    getBuildServers(),
    getDetailBreadcrumb("help-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <HelpDetail locale={locale} servers={servers} detail={detail} />
    </>
  );
}

export async function StoryDetailServerPage({ locale, pathname, paramId, semantic }: DetailPageContext) {
  const advId = Number(paramId);
  const [detail, servers, breadcrumb] = await Promise.all([
    getBuildStoryDetail(locale, advId),
    getBuildServers(),
    getDetailBreadcrumb("story-detail", paramId, locale),
  ]);
  return (
    <>
      <BreadcrumbSync locale={locale} pathname={pathname} detail={breadcrumb} />
      {semantic && <DetailSemanticSeoShell data={semantic} />}
      <StoryDetail
        locale={locale}
        servers={servers}
        advServers={detail.servers}
        advId={advId}
        initialTitle={detail.title}
        initialScript={detail.script}
        initialCharacters={detail.characters}
        initialTexts={detail.texts}
        story={detail.story}
        previous={detail.previous}
        next={detail.next}
      />
    </>
  );
}

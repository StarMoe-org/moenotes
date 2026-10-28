import { useMemo, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import AssetGallery, { type GalleryAsset } from "@/components/shared/AssetGallery";
import DetailHero from "@/components/shared/DetailHero";
import { DetailList, DetailRow } from "@/components/shared/DetailRows";
import { BandLogoMark } from "@/components/shared/BandLogo";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import {
  getCharacterSpriteUrl,
  getCharacterThumbnailUrl,
  getCharacterFaceIconUrl,
  getCharacterBoardIconUrl,
} from "@/lib/cards/assets";
import {
  type CardViewModel,
} from "@/lib/cards/data";
import {
  type CharacterProgressionData,
  type CharacterViewModel,
} from "@/lib/characters/data";
import { CharacterSectionTabs, CostumesPanel, RankRewardsPanel, useCharacterSection } from "@/components/characters/CharacterSections";
import CharacterVoicesSection from "@/components/characters/CharacterVoices";
import { BondPartnersPanel, CharacterMissionsPanel, RelatedPanels } from "@/components/characters/CharacterExtraSections";
import type { CharacterExtrasData } from "@/lib/characters/relations";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  characterId: number;
  initialData: ServerFacetedValue<DetailData>;
  progressionData: CharacterProgressionData | null;
  /** Bonds, missions and related entries (build-character-extras.ts). */
  extrasData: ServerFacetedValue<CharacterExtrasData>;
  servers: GameServer[];
}

interface DetailData {
  character: CharacterViewModel | null;
  cards: CardViewModel[];
}

/** The character as the page's server has it (docs/servers.md). */
export default function CharacterDetail({ locale, initialData, progressionData, extrasData, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const data = useMemo(() => moveReleaseUrls(valueForServer(initialData, server), entityServer(initialData, server)), [initialData, server]);
  const extras = useMemo(() => moveReleaseUrls(valueForServer(extrasData, server), entityServer(extrasData, server)), [extrasData, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers} hideSwitch>
      <CharacterDetailView locale={locale} data={data} progression={progressionData} extras={extras} serverSwitch={serverSwitch} />
    </ServerScope>
  );
}

function CharacterDetailView({ locale, data, progression, extras, serverSwitch }: { locale: AppLocale; data: DetailData; progression: CharacterProgressionData | null; extras: CharacterExtrasData; serverSwitch: ReactNode }) {
  const assetUrl = useAssetUrl();
  const { showSpoiler, now } = useSpoilerSetting();
  const visibleCards = useMemo(() => {
    if (showSpoiler) return data.cards;
    return data.cards.filter((card) => !isSpoiler(card.startAt, now));
  }, [data.cards, showSpoiler, now]);
  const visibleExtras = useMemo(() => {
    if (showSpoiler) return extras;
    return {
      ...extras,
      supportCards: extras.supportCards.filter((card) => !isSpoiler(card.startAt, now)),
    };
  }, [extras, showSpoiler, now]);
  const [section, setSection] = useCharacterSection();

  const character = data.character;
  const characterNames = useMemo(() => new Map(extras.characters.map((entry) => [entry.id, entry.name])), [extras.characters]);

  const assets = useMemo<GalleryAsset[]>(() => {
    if (!character) return [];
    return [
      { id: "sprite", label: t(locale, "characters.assets.sprite"), url: assetUrl(getCharacterSpriteUrl(character.id)), transparent: true },
      { id: "thumbnail", label: t(locale, "characters.assets.thumbnail"), url: assetUrl(getCharacterThumbnailUrl(character.id)) },
      { id: "face", label: t(locale, "characters.assets.face"), url: assetUrl(getCharacterFaceIconUrl(character.id)), transparent: true, compact: true },
      { id: "board", label: t(locale, "characters.assets.board"), url: assetUrl(getCharacterBoardIconUrl(character.id)), transparent: true, compact: true },
    ];
  }, [character, locale, assetUrl]);

  if (!character) {
    return (
      <div className="md3-surface p-8 text-center sm:p-12">
        <h1 className="text-headline-small text-on-surface">{t(locale, "characters.detailNotFound")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "characters.detailNotFoundDescription")}</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <CharacterHero locale={locale} character={character} serverSwitch={serverSwitch} />

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(20rem,2fr)_3fr] lg:items-start">
        <aside className="lg:sticky lg:top-24">
          <AssetGallery locale={locale} assets={assets} />
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <CharacterSectionTabs locale={locale} value={section} onChange={setSection} />
          {section === "costumes" && <CostumesPanel locale={locale} costumes={progression?.costumes ?? []} />}
          {section === "voices" && <CharacterVoicesSection locale={locale} characterId={character.id} characterNames={characterNames} cards={visibleCards} />}
          {section === "bonds" && <>
            <BondPartnersPanel locale={locale} extras={extras} />
            <RankRewardsPanel locale={locale} title={t(locale, "characters.rewards.friendshipTitle")} groups={progression?.friendshipRewards ?? []} />
          </>}
          {section === "missions" && <CharacterMissionsPanel locale={locale} characterName={character.name} extras={extras} />}
          {section === "related" && <RelatedPanels locale={locale} cards={visibleCards} extras={visibleExtras} />}
          {section === "profile" && <>
            <DetailList>
              <DetailRow label={t(locale, "characters.detailBand")} value={character.bandName} />
              <DetailRow
                label={t(locale, "characters.detailColor")}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border border-outline-variant" style={{ backgroundColor: character.mainColor }} />
                    <span className="font-[var(--md-ref-typeface-mono)] text-label-medium">{character.mainColor}</span>
                  </span>
                }
              />
              <DetailRow label={t(locale, "characters.detailPart")} value={character.bandPart} />
              <DetailRow label={t(locale, "characters.detailBirthday")} value={character.birthday} />
              {character.height && <DetailRow label={t(locale, "characters.detailHeight")} value={character.height} />}
              {character.school && (
                <DetailRow label={t(locale, "characters.detailSchool")} value={character.schoolClass ? `${character.school} ${character.schoolClass}` : character.school} />
              )}
              {character.hobby && <DetailRow label={t(locale, "characters.detailHobby")} value={character.hobby} />}
              {character.favoriteFood && <DetailRow label={t(locale, "characters.detailFavoriteFood")} value={character.favoriteFood} />}
              {character.constellation && <DetailRow label={t(locale, "characters.detailConstellation")} value={character.constellation} />}
              <DetailRow label={t(locale, "characters.detailVoiceActor")} value={character.voiceActor} />
            </DetailList>

            {character.description && (
              <div className="md3-surface px-6 py-5 sm:px-8 sm:py-6">
                <h2 className="text-title-large text-on-surface">{t(locale, "characters.profileTitle")}</h2>
                <p className="mt-3 max-w-[70ch] whitespace-pre-line text-body-large text-on-surface">{character.description}</p>
              </div>
            )}

            {/* The full card lists live in the related section; the profile keeps the counts. */}
            <div className="md3-surface flex flex-wrap items-center justify-between gap-3 px-6 py-4 sm:px-8">
              <p className="text-label-large text-on-surface">
                {t(locale, "characters.related.summary", { cards: visibleCards.length, supportCards: visibleExtras.supportCards.length, stories: extras.stories.length + extras.friendshipStories.length })}
              </p>
              <button type="button" onClick={() => setSection("related")} className="md3-button md3-button--outlined md3-button--small">
                {t(locale, "characters.related.open")}
              </button>
            </div>

            <RankRewardsPanel locale={locale} title={t(locale, "characters.rewards.rankTitle")} groups={progression?.rankRewards ?? []} />
          </>}

          <a href={localizePath(getRoutePathById("characters"), locale)} className="md3-button md3-button--outlined">
            {t(locale, "characters.backToList")}
          </a>
        </section>
      </div>
    </div>
  );
}

/**
 * The page heading: the character's name with her band and part, beside a strap in her two colors (MasterCharacter's
 * main and sub color), and the server switch.
 */
function CharacterHero({ locale, character, serverSwitch }: { locale: AppLocale; character: CharacterViewModel; serverSwitch: ReactNode }) {
  return (
    <DetailHero
      title={character.name}
      subtitle={character.enName || undefined}
      strap={{ main: character.mainColor, sub: character.subColor }}
      aside={serverSwitch}
      eyebrow={<>
        <BandLogoMark locale={locale} bandId={character.bandId} />
        <span>{character.bandName}</span>
        <span className="rounded-full border border-outline-variant px-2.5 text-label-medium leading-6 text-on-surface">{character.bandPart}</span>
      </>}
    >
      {character.catchCopy && <p className="mt-1 max-w-[52ch] text-body-large text-on-surface">{character.catchCopy}</p>}
    </DetailHero>
  );
}


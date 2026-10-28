"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import { formatMasterDay } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import { useNow } from "@/lib/schedule/use-now";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";
import { SpoilerNotice, DeveloperTestingBanner } from "@/components/shared/SpoilerNotice";
import {
  getSupportCardFullUrl,
  getSupportCardThumbnailUrl,
  getSupportCardSkillSpriteUrl,
  getSupportRarityIconUrl,
  getSupportCardTypeIconUrl,
} from "@/lib/support-cards/assets";
import {
  type SupportCardViewModel,
} from "@/lib/support-cards/data";
import {
  maxSupportCardBuild,
  supportCardLevelLimit,
  type SupportCardBuild,
  type SupportCardGrowth,
} from "@/lib/support-cards/growth";
import { levelParameters, maxSkillLevel, pickSkillLevel } from "@/lib/cards/growth";
import {
  type SkillLevelViewModel,
  type SkillViewModel,
} from "@/lib/cards/skills";
import {
  getBandSmallIconUrl,
  getCharacterFaceIconUrl,
} from "@/lib/cards/assets";
import { LevelControl, StepControl } from "@/components/shared/CardGrowthControls";
import CardMaterialsPanel from "@/components/cards/CardMaterialsPanel";
import type { CardMaterials } from "@/lib/cards/materials";

interface Props {
  locale: AppLocale;
  supportCardId: number;
  initialData: ServerFacetedValue<DetailData>;
  /** Limit break materials (build-card-materials.ts); null when no server has the card. */
  materials?: ServerFacetedValue<CardMaterials> | null;
  servers: GameServer[];
}

interface DetailData {
  card: SupportCardViewModel | null;
  skills: SkillViewModel[];
  growth: SupportCardGrowth;
}

/** The support card as the page's server has it (docs/servers.md). */
export default function SupportCardDetail({ locale, initialData, materials: facetedMaterials = null, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const data = useMemo(() => moveReleaseUrls(valueForServer(initialData, server), entityServer(initialData, server)), [initialData, server]);
  const materials = useMemo(() => facetedMaterials && moveReleaseUrls(valueForServer(facetedMaterials, server), entityServer(facetedMaterials, server)), [facetedMaterials, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers} hideSwitch>
      <SupportCardDetailView locale={locale} data={data} materials={materials} serverSwitch={serverSwitch} />
    </ServerScope>
  );
}

function SupportCardDetailView({ locale, data, materials, serverSwitch }: { locale: AppLocale; data: DetailData; materials: CardMaterials | null; serverSwitch: ReactNode }) {
  const assetUrl = useAssetUrl();
  const timeZone = useDisplayTimeZone();

  const card = data.card;
  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const isUnreleased = Boolean(now !== null && card?.startAt && isSpoiler(card.startAt, now));
  const growth = data.growth;
  const maxBuild = useMemo(() => maxSupportCardBuild(growth), [growth]);
  const [build, setBuild] = useState<SupportCardBuild>(maxBuild);
  const assets = useMemo<GalleryAsset[]>(() => {
    if (!card) return [];
    return [
      { id: "full", label: t(locale, "cards.assets.full"), description: "1920 × 1080", url: assetUrl(getSupportCardFullUrl(card.assetId)) },
      { id: "thumbnail", label: t(locale, "cards.assets.thumbnail"), description: "512 × 288", url: assetUrl(getSupportCardThumbnailUrl(card.assetId)) },
      { id: "sprite", label: t(locale, "cards.assets.skillSprite"), description: "120 × 48", url: assetUrl(getSupportCardSkillSpriteUrl(card.assetId)), transparent: true, compact: true },
    ];
  }, [card, locale, assetUrl]);

  if (!card) {
    return (
      <div className="md3-surface p-8 text-center sm:p-12">
        <h1 className="text-headline-small text-on-surface">{t(locale, "supportCards.detailNotFound")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "cards.detailNotFoundDescription")}</p>
      </div>
    );
  }

  if (isUnreleased && !showSpoiler) {
    return <SpoilerNotice locale={locale} />;
  }

  const attribute = t(locale, `cards.attributes.${card.cardType}`);
  const rarity = t(locale, `cards.rarities.${card.rarity}`);
  const levelLimit = supportCardLevelLimit(growth, build.rank);
  const parameters = levelParameters(card, growth.levelCurve, build.level);
  const maxParameters = levelParameters(card, growth.levelCurve, maxBuild.level);
  const parameterScale = Math.max(maxParameters.performancePower, maxParameters.technicPower, maxParameters.visualPower);
  const isMaxBuild = build.level === maxBuild.level && build.rank === maxBuild.rank;
  const rankStep = growth.rankSteps.find((step) => step.rank === build.rank);
  const skillLevelFor = (skill: SkillViewModel) =>
    (skill.kind === "gekisou" ? rankStep?.gekisouSupportSkillLevel : rankStep?.supportSkillLevel) ?? maxSkillLevel(skill);
  const setRank = (rank: number) =>
    setBuild((current) => ({ rank, level: Math.min(current.level, supportCardLevelLimit(growth, rank)) }));

  return (
    <div className="w-full space-y-8">
      {isUnreleased && <DeveloperTestingBanner locale={locale} />}
      <DetailHero
        title={card.title}
        subtitle={card.name}
        aside={serverSwitch}
        eyebrow={<>
          <BandLogoMark locale={locale} bandId={card.bandId} />
          <span>{card.bandName}</span>
          {getSupportRarityIconUrl(card.rarity)
            ? <img className="h-6 w-auto" src={assetUrl(getSupportRarityIconUrl(card.rarity))} alt={rarity} />
            : <span className="text-on-surface">{rarity}</span>}
          <span className="inline-flex items-center gap-1.5 text-on-surface"><img className="h-5 w-5" src={assetUrl(getSupportCardTypeIconUrl(card.cardType))} alt="" aria-hidden="true" />{attribute}</span>
        </>}
      >
        {card.characters.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-2">
            {card.characters.map((character) => (
              <li key={character.id}>
                <a href={localizePath(`/characters/${character.id}`, locale)} className="md3-state inline-flex items-center gap-2 rounded-full border border-outline-variant py-1 pl-1 pr-3 text-label-large text-on-surface">
                  <img className="h-7 w-7 rounded-full bg-surface-container-highest object-cover" src={assetUrl(getCharacterFaceIconUrl(character.id))} alt="" aria-hidden="true" />
                  {character.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </DetailHero>

      <div className="grid min-w-0 gap-8 lg:grid-cols-2 lg:items-start">
        <aside className="lg:sticky lg:top-24">
          <AssetGallery locale={locale} assets={assets} shape="wide" />
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <DetailList>
            <DetailRow label={t(locale, "cards.detailRarity")} value={rarity} />
            <DetailRow label={t(locale, "cards.detailAttribute")} value={<span className="inline-flex items-center gap-2"><img className="h-5 w-5" src={assetUrl(getSupportCardTypeIconUrl(card.cardType))} alt="" aria-hidden="true" />{attribute}</span>} />
            <DetailRow
              label={t(locale, "cards.detailBand")}
              value={
                <span className="inline-flex items-center gap-2">
                  <img
                    className="h-5 w-5 object-contain"
                    src={assetUrl(getBandSmallIconUrl(card.bandId))}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                  {card.bandName}
                </span>
              }
            />
            <DetailRow label={t(locale, "cards.detailReleasedAt")} value={formatMasterDay(card.startAt, locale, timeZone)} />
            <DetailRow label={t(locale, "cards.detailCardId")} value={`#${card.id}`} />
            <DetailRow label={t(locale, "cards.detailAssetId")} value={`#${card.assetId}`} />
          </DetailList>
          {/* Parameters Card */}
          <div className="md3-surface overflow-hidden">
            {/* Title Section */}
            <div className="border-b border-outline-variant px-6 py-4 sm:px-8">
              <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">
                {t(locale, "cards.parametersTitle")}
              </h3>
            </div>
            {/* Body Section */}
            <div className="p-6 sm:p-8 space-y-5">
              {growth.levelCurve.length > 0 && (
                <div className="space-y-4 border-b border-solid border-outline-variant/60 pb-5">
                  <LevelControl locale={locale} level={build.level} limit={levelLimit} onChange={(level) => setBuild((current) => ({ ...current, level }))} />
                  {growth.rankSteps.length > 1 && (
                    <StepControl
                      label={t(locale, "supportCards.growth.limitBreak")}
                      value={build.rank}
                      options={growth.rankSteps.map((step) => step.rank)}
                      onChange={setRank}
                    />
                  )}
                </div>
              )}

              {/* Highlighted Total Parameter Row */}
              <div className="flex items-center justify-between border-b border-solid border-outline-variant/60 pb-4">
                <span className="text-label-large text-on-surface-variant">
                  {t(locale, isMaxBuild ? "cards.detailPower" : "cards.growth.power")}
                </span>
                <span className="font-mono text-headline-small text-primary">
                  {parameters.totalPower.toLocaleString(locale)}
                </span>
              </div>

              <div className="space-y-4">
                <ParameterBar label={t(locale, "cards.parameters.performance")} value={parameters.performancePower} max={parameterScale} color="var(--md-sys-color-primary)" locale={locale} />
                <ParameterBar label={t(locale, "cards.parameters.technique")} value={parameters.technicPower} max={parameterScale} color="var(--md-sys-color-category2)" locale={locale} />
                <ParameterBar label={t(locale, "cards.parameters.visual")} value={parameters.visualPower} max={parameterScale} color="var(--md-sys-color-success)" locale={locale} />
              </div>
            </div>
          </div>

          {/* Skills Card */}
          <div className="md3-surface overflow-hidden">
            {/* Title Section */}
            <div className="border-b border-outline-variant px-6 py-4 sm:px-8">
              <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">
                {t(locale, "supportCards.skillsTitle")}
              </h3>
            </div>
            {/* Body Section */}
            <div className="p-6 sm:p-8 flex flex-col gap-4">
              {data.skills.length > 0 && growth.rankSteps.length > 0 ? (
                <p className="text-body-small text-on-surface-variant">{t(locale, "supportCards.growth.skillLevelHint")}</p>
              ) : null}
              {data.skills.length > 0 ? (
                data.skills.map((skill, index) => (
                  <SkillCard key={index} skill={skill} level={skillLevelFor(skill)} locale={locale} />
                ))
              ) : (
                <p className="text-body-medium text-on-surface-variant py-4 text-center">
                  暂无支援技能数据 {/* i18n-allow-hardcoded */}
                </p>
              )}
            </div>
          </div>

          {/* Card Diary Section */}
          {card.diaryText && (
            <div className="md3-surface overflow-hidden">
              <div className="border-b border-outline-variant px-6 py-4 sm:px-8">
                <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">
                  {t(locale, "supportCards.diaryTitle")}
                </h3>
              </div>
              <div className="p-6 sm:p-8">
                <div className="whitespace-pre-wrap rounded-shape-lg border border-outline-variant bg-surface-container p-5 text-body-medium leading-8 text-on-surface font-sans italic shadow-elevation-1">
                  {card.diaryText}
                </div>
              </div>
            </div>
          )}

          {materials && materials.groups.length > 0 && <CardMaterialsPanel locale={locale} groups={materials.groups} />}

          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("support-cards"), locale)} className="md3-button md3-button--tonal">
              {t(locale, "supportCards.backToList")}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function ParameterBar({
  label,
  value,
  max,
  color,
  locale,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  locale: AppLocale;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-label-large">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-mono text-on-surface">{value.toLocaleString(locale)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(4, (value / max) * 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function SkillCard({ skill, level, locale }: { skill: SkillViewModel; level: number; locale: AppLocale }) {
  const isGekisou = skill.kind === "gekisou";
  const current = pickSkillLevel(skill, level);
  const assetUrl = useAssetUrl();
  return (
    <article className="rounded-shape-lg bg-surface-container p-5">
      <div className="flex items-start gap-4">
        {skill.iconUrl ? (
          <img
            className="h-14 w-14 shrink-0 rounded-shape-lg border border-outline-variant bg-surface-container-low object-contain p-1"
            src={assetUrl(skill.iconUrl)}
            alt=""
            aria-hidden="true"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-label-medium text-primary">
            {t(locale, isGekisou ? "supportCards.skillKinds.gekisouSupport" : "supportCards.skillKinds.support")}
          </p>
          <h3 className="mt-1 text-title-medium leading-6 text-on-surface">{skill.name}</h3>
          <p className="mt-1 text-body-small text-on-surface-variant">
            {t(locale, "cards.skillMeta", { level: current.level, id: skill.id })}
          </p>
        </div>
      </div>
      <p className="mt-4 whitespace-pre-line rounded-shape-lg border border-solid border-outline-variant bg-surface-container-low p-4 text-body-medium leading-7 text-on-surface">
        {current.description || fallbackSkillDescription(current, locale)}
      </p>
    </article>
  );
}

function fallbackSkillDescription(skill: SkillLevelViewModel, locale: AppLocale): string {
  const values = skill.effects
    .map((effect) => {
      const value =
        effect.effectType < 10000
          ? `${(effect.value / 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
          : effect.value.toLocaleString(locale);
      return effect.duration === undefined ? value : `${effect.duration.toFixed(1)}s · ${value}`;
    })
    .join(" / ");
  return t(locale, "cards.skillFallback", { values });
}



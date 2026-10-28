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
  getCardBackgroundUrl,
  getCardCharacterUrl,
  getCardFullUrl,
  getCardSkillSpriteUrl,
  getCardThumbnailUrl,
  getCardTypeIconUrl,
  getRarityIconUrl,
  getBandSmallIconUrl,
} from "@/lib/cards/assets";
import type { CardViewModel } from "@/lib/cards/data";
import {
  maxMemberCardBuild,
  maxSkillLevel,
  memberCardLevelLimit,
  memberCardParameters,
  pickSkillLevel,
  type MemberCardBuild,
  type MemberCardGrowth,
} from "@/lib/cards/growth";
import {
  type SkillKind,
  type SkillLevelViewModel,
  type SkillViewModel,
} from "@/lib/cards/skills";
import { LevelControl, StepControl } from "@/components/shared/CardGrowthControls";
import AudioPlayButton from "@/components/shared/AudioPlayButton";
import CardMaterialsPanel from "@/components/cards/CardMaterialsPanel";
import type { CardMaterials } from "@/lib/cards/materials";

interface Props {
  locale: AppLocale;
  cardId: number;
  initialData: ServerFacetedValue<DetailData>;
  /** Upgrade materials and the gacha voice (build-card-materials.ts); null when no server has the card. */
  materials?: ServerFacetedValue<CardMaterials> | null;
  servers: GameServer[];
}

interface DetailData {
  card: CardViewModel | null;
  skills: SkillViewModel[];
  growth: MemberCardGrowth;
}

/** The member card as the page's server has it (docs/servers.md). */
export default function CardDetail({ locale, initialData, materials: facetedMaterials = null, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const data = useMemo(() => moveReleaseUrls(valueForServer(initialData, server), entityServer(initialData, server)), [initialData, server]);
  const materials = useMemo(() => facetedMaterials && moveReleaseUrls(valueForServer(facetedMaterials, server), entityServer(facetedMaterials, server)), [facetedMaterials, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers} hideSwitch>
      <CardDetailView locale={locale} data={data} materials={materials} serverSwitch={serverSwitch} />
    </ServerScope>
  );
}

function CardDetailView({ locale, data, materials, serverSwitch }: { locale: AppLocale; data: DetailData; materials: CardMaterials | null; serverSwitch: ReactNode }) {
  const assetUrl = useAssetUrl();
  const timeZone = useDisplayTimeZone();

  const card = data.card;
  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const isUnreleased = Boolean(card?.startAt && isSpoiler(card.startAt, now));
  const growth = data.growth;
  const maxBuild = useMemo(() => maxMemberCardBuild(growth), [growth]);
  const [build, setBuild] = useState<MemberCardBuild>(maxBuild);
  const [skillLevels, setSkillLevels] = useState<Partial<Record<SkillKind, number>>>({});
  const assets = useMemo<GalleryAsset[]>(() => {
    if (!card) return [];
    return [
      { id: "full", label: t(locale, "cards.assets.full"), description: "1440 × 1920", url: assetUrl(getCardFullUrl(card.assetId)) },
      { id: "character", label: t(locale, "cards.assets.character"), description: t(locale, "cards.assets.transparentLayer"), url: assetUrl(getCardCharacterUrl(card.assetId)), transparent: true },
      ...(card.rarity >= 3 ? [{ id: "background", label: t(locale, "cards.assets.background"), description: "1440 × 1920", url: assetUrl(getCardBackgroundUrl(card.assetId)) }] : []),
      { id: "thumbnail", label: t(locale, "cards.assets.thumbnail"), description: "384 × 512", url: assetUrl(getCardThumbnailUrl(card.assetId)) },
      { id: "sprite", label: t(locale, "cards.assets.skillSprite"), description: "120 × 48", url: assetUrl(getCardSkillSpriteUrl(card.assetId)), transparent: true, compact: true },
    ];
  }, [card, locale, assetUrl]);

  if (!card) {
    return (
      <div className="md3-surface p-8 text-center sm:p-12">
        <h1 className="text-headline-small text-on-surface">{t(locale, "cards.detailNotFound")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "cards.detailNotFoundDescription")}</p>
      </div>
    );
  }

  if (isUnreleased && !showSpoiler) {
    return <SpoilerNotice locale={locale} />;
  }

  const attribute = t(locale, `cards.attributes.${card.cardType}`);
  const rarity = t(locale, `cards.rarities.${card.rarity}`);
  const levelLimit = memberCardLevelLimit(growth, build.awakeCount);
  const parameters = memberCardParameters(card, growth, build);
  const maxParameters = memberCardParameters(card, growth, maxBuild);
  const parameterScale = Math.max(maxParameters.performancePower, maxParameters.technicPower, maxParameters.visualPower);
  const isMaxBuild = build.level === maxBuild.level && build.awakeCount === maxBuild.awakeCount && build.rank === maxBuild.rank;
  const leaderSkillLevel = growth.rankSteps.find((step) => step.rank === build.rank)?.leaderSkillLevel;
  const skillLevelFor = (skill: SkillViewModel) =>
    (skill.kind === "leader" && leaderSkillLevel !== undefined ? leaderSkillLevel : skillLevels[skill.kind]) ?? maxSkillLevel(skill);
  // The leader skill level is derived from the rank (in-game Awaken), so changing it moves the rank instead.
  const setSkillLevel = (skill: SkillViewModel, level: number) => {
    const rankStep = skill.kind === "leader"
      ? [...growth.rankSteps].reverse().find((step) => step.leaderSkillLevel <= level) ?? growth.rankSteps[0]
      : undefined;
    if (rankStep) setBuild((current) => ({ ...current, rank: rankStep.rank }));
    else setSkillLevels((current) => ({ ...current, [skill.kind]: level }));
  };
  const setAwakeCount = (awakeCount: number) =>
    setBuild((current) => ({ ...current, awakeCount, level: Math.min(current.level, memberCardLevelLimit(growth, awakeCount)) }));

  return (
    <div className="w-full space-y-8">
      {isUnreleased && <DeveloperTestingBanner locale={locale} />}
      <DetailHero
        title={card.title}
        subtitle={<a href={localizePath(`/characters/${card.characterId}`, locale)} className="hover:text-primary hover:underline">{card.characterName}</a>}
        strap={card.characterColor ? { main: card.characterColor } : null}
        aside={serverSwitch}
        eyebrow={<>
          <BandLogoMark locale={locale} bandId={card.bandId} />
          <span>{card.bandName}</span>
          <img className="h-6 w-auto" src={assetUrl(getRarityIconUrl(card.rarity))} alt={rarity} />
          <span className="inline-flex items-center gap-1.5 text-on-surface"><img className="h-5 w-5" src={assetUrl(getCardTypeIconUrl(card.cardType))} alt="" aria-hidden="true" />{attribute}</span>
        </>}
      >
        {card.gachaVoice && (
          <p className="mt-1 flex max-w-[52ch] items-start gap-3 text-body-large text-on-surface">
            {materials?.gachaVoiceUrl && (
              <AudioPlayButton locale={locale} size="sm" className="mt-0.5 shrink-0" track={{ id: `card-gacha-voice:${card.id}`, src: materials.gachaVoiceUrl, title: card.gachaVoice, subtitle: card.characterName }} />
            )}
            <span>{card.gachaVoice}</span>
          </p>
        )}
      </DetailHero>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(20rem,2fr)_3fr] lg:items-start">
        <aside className="lg:sticky lg:top-24">
          <AssetGallery locale={locale} assets={assets} />
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <DetailList>
            <DetailRow label={t(locale, "cards.detailRarity")} value={rarity} />
            <DetailRow label={t(locale, "cards.detailAttribute")} value={<span className="inline-flex items-center gap-2"><img className="h-5 w-5" src={assetUrl(getCardTypeIconUrl(card.cardType))} alt="" aria-hidden="true" />{attribute}</span>} />
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
                  {growth.awakeSteps.length > 1 && (
                    <StepControl
                      label={t(locale, "cards.growth.training")}
                      value={build.awakeCount}
                      options={growth.awakeSteps.map((step) => step.awakeCount)}
                      onChange={setAwakeCount}
                    />
                  )}
                  {growth.rankSteps.length > 1 && (
                    <StepControl
                      label={t(locale, "cards.growth.awaken")}
                      value={build.rank}
                      options={growth.rankSteps.map((step) => step.rank)}
                      onChange={(rank) => setBuild((current) => ({ ...current, rank }))}
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
                {t(locale, "cards.skillsTitle")}
              </h3>
            </div>
            {/* Body Section */}
            <div className="p-6 sm:p-8 flex flex-col gap-4">
              {data.skills.map((skill) => (
                <SkillCard
                  key={skill.kind}
                  skill={skill}
                  level={skillLevelFor(skill)}
                  locale={locale}
                  hint={skill.kind === "leader" && growth.rankSteps.length > 0 ? t(locale, "cards.growth.leaderSkillHint") : undefined}
                  onLevelChange={(level) => setSkillLevel(skill, level)}
                />
              ))}
            </div>
          </div>

          {materials && materials.groups.length > 0 && <CardMaterialsPanel locale={locale} groups={materials.groups} />}

          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("cards"), locale)} className="md3-button md3-button--tonal">
              {t(locale, "cards.backToList")}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}


function ParameterBar({ label, value, max, color, locale }: { label: string; value: number; max: number; color: string; locale: AppLocale }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-label-large">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-mono text-on-surface">{value.toLocaleString(locale)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest">
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, (value / max) * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function SkillCard({
  skill,
  level,
  locale,
  hint,
  onLevelChange,
}: {
  skill: SkillViewModel;
  level: number;
  locale: AppLocale;
  hint?: string | undefined;
  onLevelChange: (level: number) => void;
}) {
  const current = pickSkillLevel(skill, level);
  const assetUrl = useAssetUrl();
  return (
    <article className="rounded-shape-lg bg-surface-container p-5">
      <div className="flex items-start gap-4">
        {skill.iconUrl ? <img className="h-14 w-14 shrink-0 rounded-shape-lg border border-outline-variant bg-surface-container-low object-contain p-1" src={assetUrl(skill.iconUrl)} alt="" aria-hidden="true" /> : null}
        <div className="min-w-0"><p className="text-label-medium text-primary">{t(locale, `cards.skillKinds.${skill.kind}`)}</p><h3 className="mt-1 text-title-medium leading-6 text-on-surface">{skill.name}</h3><p className="mt-1 text-body-small text-on-surface-variant">{t(locale, "cards.skillMeta", { level: current.level, id: skill.id })}</p></div>
      </div>
      {skill.levels.length > 1 ? (
        <div className="mt-4">
          <StepControl label={t(locale, "cards.growth.skillLevel")} value={current.level} options={skill.levels.map((entry) => entry.level)} onChange={onLevelChange} />
        </div>
      ) : null}
      {hint ? <p className="mt-3 text-body-small text-on-surface-variant">{hint}</p> : null}
      <p className="mt-4 whitespace-pre-line rounded-shape-lg border border-solid border-outline-variant bg-surface-container-low p-4 text-body-medium leading-7 text-on-surface">
        {current.description || fallbackSkillDescription(current, locale)}
      </p>
    </article>
  );
}

function fallbackSkillDescription(skill: SkillLevelViewModel, locale: AppLocale): string {
  const values = skill.effects.map((effect) => {
    const value = effect.effectType < 10000 ? `${(effect.value / 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%` : effect.value.toLocaleString(locale);
    return effect.duration === undefined ? value : `${effect.duration.toFixed(1)}s · ${value}`;
  }).join(" / ");
  return t(locale, "cards.skillFallback", { values });
}


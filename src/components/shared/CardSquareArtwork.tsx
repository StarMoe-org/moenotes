import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { assetConfig } from "@/config/assets";
import NativeGameCard from "@/components/shared/NativeGameCard";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import { getCardSquareFrameUrl, getCardThumbnailUrl, getCardTypeIconUrl, getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { getSupportCardSquareFrameUrl, getSupportCardThumbnailUrl, getSupportCardTypeIconUrl } from "@/lib/support-cards/assets";
import { releaseFileUrl } from "@/lib/assets/release";
import { useAssetUrl, useContentServerScope } from "@/lib/servers/use-content-server";

function memberSquareUrl(card: CardViewModel, locale: AppLocale): string {
  return releaseFileUrl(`MemberCard/${card.assetId}/member_thumbnail`, "square.webp", locale);
}

/** Whether the page's server has a published game UI library, so cards can use the game's own square prefab. */
function useNativeUi(): boolean {
  const { server } = useContentServerScope();
  return !!assetConfig.gameUiLibraries[server].trim();
}

/** A member card as the game's 1:1 square icon (frame, attribute and rarity painted by the game where available). */
export function MemberSquareArtwork({ locale, card, className = "", level, rank }: { locale: AppLocale; card: CardViewModel; className?: string; level?: number | undefined; rank?: number | undefined }) {
  return useNativeUi()
    ? <NativeMemberArtwork locale={locale} card={card} className={className} level={level} rank={rank} />
    : <SquareImage
      sources={[memberSquareUrl(card, locale), getCardThumbnailUrl(card.assetId), getCharacterFaceIconUrl(card.characterId)]}
      frameUrl={getCardSquareFrameUrl(card.rarity)} typeIconUrl={getCardTypeIconUrl(card.cardType)} attributeLabel={t(locale, `cards.attributes.${card.cardType}`)}
      label={`${card.characterName} ${card.title}`.trim()} className={className} />;
}

/** A support card (Snap) as the game's 1:1 square icon; the wide Snap art is cropped by the square, not stretched. */
export function SupportSquareArtwork({ locale, card, className = "", level, rank }: { locale: AppLocale; card: SupportCardViewModel; className?: string; level?: number | undefined; rank?: number | undefined }) {
  const face = card.characterIds[0];
  return useNativeUi() && card.rarity !== 10
    ? <NativeSupportArtwork card={card} className={className} level={level} rank={rank} />
    : <SquareImage
      sources={[getSupportCardThumbnailUrl(card.assetId), ...(face ? [getCharacterFaceIconUrl(face)] : [])]}
      frameUrl={getSupportCardSquareFrameUrl(card.rarity)} typeIconUrl={getSupportCardTypeIconUrl(card.cardType)} attributeLabel={t(locale, `cards.attributes.${card.cardType}`)}
      label={card.name} className={className} />;
}

export function NativeMemberArtwork({ locale, card, className, level, rank }: { locale: AppLocale; card: CardViewModel; className: string; level?: number | undefined; rank?: number | undefined }) {
  const assetUrl = useAssetUrl();
  const data = useMemo(() => ({ leader: false, member: { rarity: card.rarity, cardType: card.cardType,
    ...(level !== undefined ? { level } : {}), ...(rank !== undefined ? { rank } : {}),
    thumbnailUrl: assetUrl(memberSquareUrl(card, locale)),
    thumbnailSpriteKey: `MemberCard/${card.assetId}/member_thumbnail[square]`,
  } }), [card, locale, assetUrl, level, rank]);
  return <NativeGameCard entry="memberSquare" data={data} label={`${card.characterName} ${card.title}`} className={className} />;
}

export function NativeSupportArtwork({ card, className, level, rank }: { card: SupportCardViewModel; className: string; level?: number | undefined; rank?: number | undefined }) {
  const assetUrl = useAssetUrl();
  const data = useMemo(() => ({ leader: false, support: { rarity: card.rarity, cardType: card.cardType,
    ...(level !== undefined ? { level } : {}), ...(rank !== undefined ? { rank } : {}),
    thumbnailUrl: assetUrl(getSupportCardThumbnailUrl(card.assetId)),
    thumbnailSpriteKey: `SupportCard/${card.assetId}/snap_thumbnail[snap_thumbnail]`,
  } }), [card, assetUrl, level, rank]);
  return <NativeGameCard entry="supportSquare" data={data} label={card.name} className={className} />;
}

/** Servers without a game UI library: the square image (or the next source that loads), center-cropped. */
function SquareImage({ sources, frameUrl, typeIconUrl, attributeLabel, label, className }: {
  sources: readonly string[]; frameUrl: string; typeIconUrl: string; attributeLabel: string; label: string; className: string;
}) {
  const assetUrl = useAssetUrl();
  const [attempt, setAttempt] = useState(0);
  const source = sources[attempt];
  return (
    <div className={`relative aspect-square overflow-hidden rounded-[12%] bg-[var(--md-sys-color-surface-container-high)] ${className}`.trim()}>
      {source ? (
        <img className="h-full w-full object-cover" crossOrigin="anonymous" src={assetUrl(source)} alt={label} loading="lazy" onError={() => setAttempt((current) => current + 1)} />
      ) : (
        <span className="grid h-full place-items-center p-2 text-center text-xs font-medium text-[var(--md-sys-color-on-surface-variant)]">{label}</span>
      )}
      <img className="pointer-events-none absolute inset-0 h-full w-full" src={frameUrl} alt="" aria-hidden="true" />
      <img className="absolute left-[6%] top-[6%] h-[22%] w-[22%] drop-shadow-sm" src={typeIconUrl} alt={attributeLabel} />
    </div>
  );
}

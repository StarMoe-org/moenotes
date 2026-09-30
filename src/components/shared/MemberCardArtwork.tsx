import { useState } from "react";
import {
  getCardFrameUrl,
  getCardThumbnailUrl,
  getCardTypeIconUrl,
  getCharacterFaceIconUrl,
  type CardRarity,
  type CardType,
} from "@/lib/cards/assets";
import { useAssetUrl } from "@/lib/servers/use-content-server";

interface Props {
  assetId: number;
  characterId: number;
  rarity: CardRarity;
  cardType: CardType;
  alt: string;
  attributeLabel: string;
  fallbackLabel: string;
  eager?: boolean;
  className?: string;
}

export default function MemberCardArtwork({
  assetId,
  characterId,
  rarity,
  cardType,
  alt,
  attributeLabel,
  fallbackLabel,
  eager = false,
  className = "",
}: Props) {
  const assetUrl = useAssetUrl();
  // The card's thumbnail, then the character's face icon, then the label.
  const [attempt, setAttempt] = useState(0);
  const source = assetUrl(attempt === 0 ? getCardThumbnailUrl(assetId) : getCharacterFaceIconUrl(characterId));
  const failed = attempt > 1;

  const handleImageError = () => setAttempt((current) => current + 1);

  return (
    <div className={`relative aspect-[3/4] overflow-hidden bg-[var(--mn-cream-deep)] ${className}`.trim()}>
      {!failed ? (
        <img
          className="h-full w-full object-cover"
          src={source}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          onError={handleImageError}
        />
      ) : (
        <div className="grid h-full place-items-center p-4 text-center text-sm font-medium text-[var(--mn-text-muted)]">
          {fallbackLabel}
        </div>
      )}
      <img className="pointer-events-none absolute inset-0 h-full w-full" src={getCardFrameUrl(rarity)} alt="" aria-hidden="true" />
      <img className="absolute left-2 top-2 h-8 w-8 drop-shadow-sm" src={getCardTypeIconUrl(cardType)} alt={attributeLabel} />
    </div>
  );
}

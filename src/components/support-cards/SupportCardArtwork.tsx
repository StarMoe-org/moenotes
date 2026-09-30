import { useState } from "react";
import {
  getSupportCardFrameUrl,
  getSupportCardThumbnailUrl,
  getSupportCardTypeIconUrl,
  type SupportCardRarity,
  type SupportCardType,
} from "@/lib/support-cards/assets";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { useAssetUrl } from "@/lib/servers/use-content-server";

interface Props {
  assetId: number;
  characterIds: number[];
  rarity: SupportCardRarity;
  cardType: SupportCardType;
  alt: string;
  attributeLabel: string;
  fallbackLabel: string;
  eager?: boolean;
  className?: string;
}

export default function SupportCardArtwork({
  assetId,
  characterIds,
  rarity,
  cardType,
  alt,
  attributeLabel,
  fallbackLabel,
  eager = false,
  className = "",
}: Props) {
  const assetUrl = useAssetUrl();
  const fallbackCharId = characterIds[0];
  // The card's thumbnail, then the first character's face icon, then the label.
  const [attempt, setAttempt] = useState(0);
  const source = assetUrl(attempt === 0 ? getSupportCardThumbnailUrl(assetId) : fallbackCharId ? getCharacterFaceIconUrl(fallbackCharId) : "");
  const failed = attempt > 1 || !source;

  const handleImageError = () => setAttempt((current) => current + 1);

  return (
    <div className={`relative aspect-[16/9] overflow-hidden bg-[var(--mn-cream-deep)] ${className}`.trim()}>
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
      {getSupportCardFrameUrl(rarity) && <img className="pointer-events-none absolute inset-0 h-full w-full" src={getSupportCardFrameUrl(rarity)} alt="" aria-hidden="true" />}
      <img className="absolute left-1.5 top-1.5 h-6 w-6 drop-shadow-sm" src={getSupportCardTypeIconUrl(cardType)} alt={attributeLabel} />
    </div>
  );
}

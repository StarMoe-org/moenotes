import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { useAssetUrl } from "@/lib/servers/use-content-server";

export interface AvatarStackCharacter {
  id: number;
  /** Localized name (alt text and tooltip). */
  name: string;
}

export interface CharacterAvatarStackProps {
  locale: AppLocale;
  characters: readonly AvatarStackCharacter[];
  /** Faces shown before the rest fold into "+N" (default 5). */
  max?: number;
  size?: "sm" | "md" | "lg";
  /** Also print the names after the faces (default false: names are tooltips and alt text). */
  showNames?: boolean;
  className?: string;
}

const sizeClass = { sm: "h-6 w-6 -ml-1.5", md: "h-8 w-8 -ml-2", lg: "h-10 w-10 -ml-2.5" } as const;

/** Overlapping character faces with their localized names; extra characters fold into a "+N" chip. */
export default function CharacterAvatarStack({ locale, characters, max = 5, size = "md", showNames = false, className = "" }: CharacterAvatarStackProps) {
  const assetUrl = useAssetUrl();
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  if (characters.length === 0) return null;
  const limit = Math.max(1, max);
  // Folding a single face into "+1" saves nothing; show it instead.
  const shown = characters.length - limit === 1 ? characters : characters.slice(0, limit);
  const hidden = characters.slice(shown.length);
  const names = characters.map((character) => character.name).filter(Boolean);
  const label = names.join(t(locale, "collectionView.nameSeparator"));

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <span className="flex shrink-0 items-center pl-[0.375rem]" role="img" aria-label={label || undefined}>
        {shown.map((character) => (
          failed.has(character.id) ? (
            <span key={character.id} title={character.name} aria-hidden="true" className={`${sizeClass[size]} grid place-items-center rounded-full border-2 border-[var(--mn-paper)] bg-[var(--mn-cream-deep)] text-[10px] font-black text-[var(--mn-text-muted)] first:ml-0`}>
              {character.name.slice(0, 1)}
            </span>
          ) : (
            <img
              key={character.id}
              src={assetUrl(getCharacterFaceIconUrl(character.id))}
              alt=""
              title={character.name}
              loading="lazy"
              decoding="async"
              onError={() => setFailed((current) => new Set(current).add(character.id))}
              className={`${sizeClass[size]} rounded-full border-2 border-[var(--mn-paper)] bg-[var(--mn-cream-deep)] object-cover first:ml-0`}
            />
          )
        ))}
        {hidden.length > 0 && (
          <span
            title={hidden.map((character) => character.name).join(t(locale, "collectionView.nameSeparator"))}
            className={`${sizeClass[size]} grid place-items-center rounded-full border-2 border-[var(--mn-paper)] bg-[var(--mn-surface-strong)] text-[11px] font-black tabular-nums text-[var(--mn-text-muted)]`}
          >
            +{hidden.length}
          </span>
        )}
      </span>
      {showNames && label ? <span className="min-w-0 truncate text-xs font-semibold text-[var(--mn-text-muted)]" aria-hidden="true">{label}</span> : null}
    </span>
  );
}

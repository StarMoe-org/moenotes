import { useState } from "react";
import { playerCardPath } from "@/config/account";
import { rankingProfileCardUrl } from "@/config/game-api";
import type { GameServer } from "@/config/servers";

interface Props {
  server: GameServer;
  profileId: string | null | undefined;
  /** Number of namecard images available. */
  images: number;
  /** Player name for alt text. */
  playerName: string;
  /** Small thumbnail for ranking list, or full size for detail view. */
  variant?: "thumbnail" | "full";
  /** Use ranking API endpoint (public, cached) instead of account API (requires auth). */
  useRankingApi?: boolean;
}

/**
 * Displays the first available namecard image from a player's profile card.
 * Used in ranking lists to show player identity beyond just their name.
 */
export default function PlayerNamecard({ server, profileId, images, playerName, variant = "thumbnail", useRankingApi = false }: Props) {
  const [failed, setFailed] = useState(false);

  if (!profileId || images <= 0 || failed) {
    return null;
  }

  const isThumbnail = variant === "thumbnail";
  const cardUrl = useRankingApi
    ? rankingProfileCardUrl(server, profileId, 1)  // Ranking API uses 1-based page index
    : playerCardPath(server, profileId, 0, false);  // Account API uses 0-based index

  return (
    <img
      src={cardUrl}
      alt={`${playerName}'s namecard`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={
        isThumbnail
          ? "h-8 w-14 shrink-0 rounded border border-[var(--mn-border)]/50 bg-[var(--mn-cream-deep)] object-cover"
          : "aspect-[1224/688] w-full rounded-xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)] object-cover"
      }
    />
  );
}

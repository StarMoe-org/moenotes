import type { GameServer } from "@/config/players";

/**
 * A player profile as the page shows it, read from starmoe-api's stored file (its README, "Player profiles"): the
 * gateway's answers untouched, where int64 values are decimal strings and missing values are simply absent.
 */
export interface PlayerSnapshot {
  server: GameServer;
  profileId: string;
  /** When starmoe-api fetched it, Unix milliseconds. */
  fetchedAt: number;
  name: string | null;
  level: number | null;
  rankExp: number | null;
  /** How many players favorited this one; null when unknown. */
  favorites: number | null;
  favoriteCard: FavoriteCard | null;
  /** The profile card set the player shows: its name and how many images it has (served by index). */
  profileCard: { name: string | null; images: number } | null;
  /** When the game last saw a change to the profile, Unix milliseconds. */
  lastUpdatedAt: number | null;
}

export interface FavoriteCard {
  cardId: number;
  awakeCount: number;
  cardRank: number;
  liveSkillLevel: number;
  performanceSkillLevel: number;
}

type Json = Record<string, unknown>;

function object(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

/** protobuf JSON writes int64 as a string and leaves out zero values. */
function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

export function parsePlayerSnapshot(raw: unknown): PlayerSnapshot | null {
  const root = object(raw);
  const profile = object(root?.profile);
  if (!root || !profile || typeof root.server !== "string" || typeof root.profileId !== "string") return null;
  const brief = object(root.brief);
  const favorites = object(root.favorites);
  const card = object(profile.favoriteMemberCard);
  const profileCard = object(profile.profileCard);
  const cardImages = Array.isArray(profileCard?.thumbnailUrl) ? profileCard.thumbnailUrl.length : 0;
  const cardId = number(card?.cardId);
  const lastUpdated = number(profile.lastUpdatedAt);

  return {
    server: root.server as GameServer,
    profileId: root.profileId,
    fetchedAt: number(root.fetchedAt) ?? 0,
    name: typeof profile.name === "string" && profile.name ? profile.name : null,
    level: number(brief?.level),
    rankExp: number(profile.rankExp),
    // `{}` means none: a zero count is left out.
    favorites: favorites ? (number(favorites.totalFavorite) ?? 0) : null,
    favoriteCard:
      card && cardId
        ? {
            cardId,
            awakeCount: number(card.awakeCount) ?? 0,
            cardRank: number(card.cardRank) ?? 0,
            liveSkillLevel: number(card.liveSkillLevel) ?? 0,
            performanceSkillLevel: number(card.performanceSkillLevel) ?? 0,
          }
        : null,
    profileCard: cardImages > 0 ? { name: typeof profileCard?.name === "string" && profileCard.name ? profileCard.name : null, images: cardImages } : null,
    lastUpdatedAt: lastUpdated ? lastUpdated * 1000 : null,
  };
}

/**
 * A song's high-score ranking as the game API returns it (rankd passes it through). Every field may be missing;
 * ids are decimal strings. An empty ranking is `{}`.
 */
export interface MusicRanking {
  players?: RankingPlayer[];
}

export interface RankingPlayer {
  score?: number;
  playerData?: {
    id?: string;
    name?: string;
    profileId?: string;
    rankExp?: number;
    profileCard?: {
      name?: string;
      slot?: number;
      thumbnailUrl?: string[];
    };
  };
  highScoreDeck?: { id?: number; name?: string; totalPower?: number; cards?: RankingDeckSlot[] };
  profile?: {
    id?: string;
    name?: string;
    profileId?: string;
    profileCard?: {
      name?: string;
      thumbnailUrl?: string[];
    };
  };
}

export interface RankingDeckSlot {
  /** Missing on the first slot (0). */
  slotIndex?: number;
  memberCard?: { cardId?: string; exp?: number; awakeCount?: number; cardRank?: number };
  supportCard?: { cardId?: string; exp?: number; rank?: number };
}

export interface RankingDeckCard {
  slot: number;
  memberCardId: number | null;
  memberExp: number | null;
  cardRank: number | null;
  supportCardId: number | null;
  supportExp: number | null;
  supportRank: number | null;
}

export interface RankingRow {
  /** Worked out from the scores: tied scores share the better place. The game does not return places. */
  rank: number;
  tied: boolean;
  uid: string;
  name: string;
  score: number;
  deckName: string;
  totalPower: number | null;
  cards: RankingDeckCard[];
  /** Profile card information when available from the ranking data. */
  profileCard?: { name: string | null; images: number } | null;
  profileId?: string | null;
}

/**
 * What the ranking needs to draw a deck, from the site's MasterData, keyed by card id: member cards as
 * `[assetId, characterId, rarity, cardType, title, levelGroup]`, support cards as
 * `[assetId, rarity, cardType, title, levelGroup]`. `levelExp` holds each level group's total exp per level
 * (index `level - 1`), which turns a card's `exp` into its level.
 */
export interface DeckCardLookup {
  member: Record<string, [number, number, 2 | 3 | 4, 1 | 2 | 3 | 4 | 5, string, number]>;
  support: Record<string, [number, 2 | 3 | 4 | 10, 1 | 2 | 3 | 4 | 5, string, number]>;
  levelExp: { member: Record<string, number[]>; support: Record<string, number[]> };
}

/** The highest level whose total exp `exp` reaches, or null without the table or the exp. */
export function levelFromExp(levelExp: readonly number[] | undefined, exp: number | null): number | null {
  if (!levelExp?.length || exp === null) return null;
  let level = 0;
  while (level < levelExp.length && levelExp[level]! <= exp) level += 1;
  return Math.max(level, 1);
}

/**
 * `by: "score"` (song rankings) sorts by score and gives tied scores the better place. `by: "response"` (event
 * challenge boards) keeps the game's order and numbers rows `index + 1`: there the earlier of two equal scores
 * ranks first, so rows are never reordered or merged.
 */
export function toRankingRows(ranking: MusicRanking, by: "score" | "response" = "score"): RankingRow[] {
  const players = (Array.isArray(ranking.players) ? ranking.players : [])
    .map((player, index) => ({ player, index, score: typeof player.score === "number" ? player.score : 0 }));
  if (by === "score") players.sort((a, b) => b.score - a.score || a.index - b.index);
  const counts = new Map<number, number>();
  for (const { score } of players) counts.set(score, (counts.get(score) ?? 0) + 1);

  let rank = 0;
  let previous: number | null = null;
  const seen = new Set<string>();
  return players.map(({ player, index, score }, position) => {
    if (by === "response" || score !== previous) rank = position + 1;
    previous = score;
    const deck = player.highScoreDeck;
    const profile = player.profile;
    // profileCard can be in either playerData (new API) or profile (old API)
    const profileCard = player.playerData?.profileCard ?? profile?.profileCard;
    const cardImages = Array.isArray(profileCard?.thumbnailUrl) ? profileCard.thumbnailUrl.length : 0;
    // Boards keep repeated players as the game sent them; the key still has to be unique.
    let uid = player.playerData?.id ?? String(index);
    if (seen.has(uid)) uid = `${uid}#${index}`;
    seen.add(uid);
    return {
      rank,
      tied: by === "score" && (counts.get(score) ?? 0) > 1,
      uid,
      name: player.playerData?.name ?? profile?.name ?? "",
      score,
      deckName: deck?.name ?? "",
      totalPower: typeof deck?.totalPower === "number" ? deck.totalPower : null,
      cards: (Array.isArray(deck?.cards) ? deck.cards : [])
        .map((slot) => ({
          slot: slot.slotIndex ?? 0,
          memberCardId: numericId(slot.memberCard?.cardId),
          memberExp: slot.memberCard?.exp ?? null,
          cardRank: slot.memberCard?.cardRank ?? null,
          supportCardId: numericId(slot.supportCard?.cardId),
          supportExp: slot.supportCard?.exp ?? null,
          supportRank: slot.supportCard?.rank ?? null,
        }))
        .sort((a, b) => a.slot - b.slot),
      profileCard: cardImages > 0 ? { name: typeof profileCard?.name === "string" && profileCard.name ? profileCard.name : null, images: cardImages } : null,
      profileId: typeof profile?.profileId === "string" ? profile.profileId : (typeof player.playerData?.profileId === "string" ? player.playerData.profileId : null),
    };
  });
}

function numericId(value: string | undefined): number | null {
  const id = value ? Number(value) : Number.NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

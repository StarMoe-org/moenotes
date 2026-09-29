/**
 * A song's high-score ranking as the game API returns it (rankd passes it through). Every field may be missing;
 * ids are decimal strings. An empty ranking is `{}`.
 */
export interface MusicRanking {
  players?: RankingPlayer[];
}

export interface RankingPlayer {
  score?: number;
  playerData?: { id?: string; name?: string; profileId?: string; rankExp?: number };
  highScoreDeck?: { id?: number; name?: string; totalPower?: number; cards?: RankingDeckSlot[] };
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

export function toRankingRows(ranking: MusicRanking): RankingRow[] {
  const players = (Array.isArray(ranking.players) ? ranking.players : [])
    .map((player, index) => ({ player, index, score: typeof player.score === "number" ? player.score : 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const counts = new Map<number, number>();
  for (const { score } of players) counts.set(score, (counts.get(score) ?? 0) + 1);

  let rank = 0;
  let previous: number | null = null;
  return players.map(({ player, index, score }, position) => {
    if (score !== previous) rank = position + 1;
    previous = score;
    const deck = player.highScoreDeck;
    return {
      rank,
      tied: (counts.get(score) ?? 0) > 1,
      uid: player.playerData?.id ?? String(index),
      name: player.playerData?.name ?? "",
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
    };
  });
}

function numericId(value: string | undefined): number | null {
  const id = value ? Number(value) : Number.NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

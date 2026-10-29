/**
 * rankd's event catalog and live ranking data (its docs/api.md and docs/challenges.md). Ids are decimal strings,
 * times Unix ms. rankd returns no text: names and art come from the site's MasterData by `eventId` / `musicId`.
 */

export type EventStatus = "feature" | "nowOn" | "aggregation" | "result" | "end";
export type PointCollectStatus = "pending" | "collecting" | "finalizing" | "archiving" | "archived" | "disabled" | "missed";
export type ChallengeCollectStatus = "unknown" | "disabled" | "pending" | "collecting" | "finalizing" | "archived" | "missed";

export interface RankdEvent {
  eventId: string;
  eventType?: number;
  startAt: number;
  endAt: number;
  displayEndAt?: number;
  aggregationSeconds?: number;
  eventStatus: EventStatus;
  /** The point ranking's collection only; the challenge song boards carry their own. */
  collectStatus: PointCollectStatus;
  rankingDisabled?: boolean;
  /** The two challenge board switches; a disabled point ranking leaves them alone. */
  musicRankingDisabled?: boolean;
  totalMusicRankingDisabled?: boolean;
  pointRanking?: { enabled: boolean; collectStatus: PointCollectStatus; disabledReason?: string };
  challengeRankings?: ChallengeRanking[];
  /** The event-level total board; absent on payloads from a service that predates it. */
  totalRanking?: ChallengeTotalRanking;
  lastFetchedAt?: number;
  seq?: number;
  stale?: boolean;
  finalQuality?: string;
}

/** A reward row of a board; only the total board names the rewards it hands out. */
export interface RewardBand {
  rankStart: number;
  rankEnd: number;
  rewardIds?: Array<string | number>;
}

export interface ChallengeRanking {
  /** Requests use this id; `musicId` is the song for its title and jacket. */
  challengeMusicId: string;
  musicId: string;
  startAt?: number;
  endAt?: number;
  rankingRewardGroup?: string;
  rewardBands?: RewardBand[];
  rankingEnabled: boolean;
  collectStatus: ChallengeCollectStatus;
  effectiveStartAt?: number;
  effectiveEndAt?: number;
  lastFetchedAt?: number;
  stale?: boolean;
  refreshing?: boolean;
  /** `responseOrder`: the rows keep the game's order, so a row's place is its index. */
  positionSource?: string;
}

/** The event-level challenge total board: one per event, summed by the game rather than from the song boards. */
export interface ChallengeTotalRanking {
  rankingEnabled: boolean;
  collectStatus: ChallengeCollectStatus;
  effectiveStartAt?: number;
  effectiveEndAt?: number;
  lastFetchedAt?: number;
  stale?: boolean;
  refreshing?: boolean;
  positionSource?: string;
  rewardBands?: RewardBand[];
}

/** `…/events/{eventId}/latest`: the merged point ranking snapshot. */
export interface PointRankingLatest {
  seq: number;
  updatedAt: number;
  nextUpdateAt?: number;
  stale?: boolean;
  frozen?: boolean;
  parts?: Record<string, { fetchedAt?: number; missing?: number[]; dup?: number[] }>;
  rows?: PointRankingRow[];
}

export interface PointRankingRow {
  rank: number;
  point: number;
  part?: string;
  /** Several rows share this rank. */
  dup?: boolean;
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

/** Whether the event has a point ranking at all (a disabled one hides only that ranking, not the event). */
export function hasPointRanking(event: RankdEvent): boolean {
  if (event.pointRanking) return event.pointRanking.enabled;
  return !event.rankingDisabled && event.collectStatus !== "disabled";
}

/** The point ranking can be read: rankd has observed it at least once. */
export function pointRankingReadable(event: RankdEvent): boolean {
  const status = event.pointRanking?.collectStatus ?? event.collectStatus;
  return hasPointRanking(event) && status !== "pending" && status !== "missed";
}

const READABLE_COLLECT = new Set<ChallengeCollectStatus>(["collecting", "finalizing", "archived"]);

/** A challenge song board can be requested (the other states answer 404). */
export function challengeReadable(challenge: ChallengeRanking): boolean {
  return challenge.rankingEnabled && READABLE_COLLECT.has(challenge.collectStatus);
}

/** The total board can be requested on the same states as a song board. */
export function totalRankingReadable(board: ChallengeTotalRanking | undefined): boolean {
  if (!board?.rankingEnabled) return false;
  return READABLE_COLLECT.has(board.collectStatus);
}

/** Ranks the point snapshot asked for but did not get, from every part. */
export function missingRanks(latest: PointRankingLatest): number[] {
  return [...new Set(Object.values(latest.parts ?? {}).flatMap((part) => part.missing ?? []))].sort((a, b) => a - b);
}

/** Ranks where a reward band ends and the next begins, e.g. 1, 3, 10, 100: the cut-offs worth marking in a board. */
export function rewardBoundaries(board: { rewardBands?: RewardBand[] }): number[] {
  return [...new Set((board.rewardBands ?? []).map((band) => band.rankEnd).filter((rank) => Number.isSafeInteger(rank) && rank > 0))].sort((a, b) => a - b);
}

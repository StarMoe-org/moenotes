import type { GameServer } from "@/config/servers";
import { restrictFacetServers, type ServerFaceted } from "@/lib/servers/facets";
import { parseMasterDate } from "@/lib/schedule";

/** The schedule-bearing shape shared by story view models and their merged regional variants. */
export type StoryReleaseFaceted = ServerFaceted<{ startAt: string }>;

const MASTER_RELEASE_DATE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?([+-]\d{2}:\d{2})?$/;

/**
 * Parse a release time only when MasterData supplied a real, non-empty date and time. `parseMasterDate` is intentionally
 * permissive for display/schedule use (an absent bound means an open schedule); a release gate must instead fail closed.
 */
export function parseStoryReleaseTime(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const match = value.trim().match(MASTER_RELEASE_DATE);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText = "0", minuteText = "0", secondText = "0", offsetText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (offsetText) {
    const offsetHour = Number(offsetText.slice(1, 3));
    const offsetMinute = Number(offsetText.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }

  const parsed = parseMasterDate(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/** Whether a single regional MasterData release date is valid and has passed. */
export function isStoryReleasedAt(startAt: unknown, now: number): boolean {
  if (!Number.isFinite(now)) return false;
  const releaseTime = parseStoryReleaseTime(startAt);
  return releaseTime !== null && releaseTime <= now;
}

/** Release dates as each server's own MasterData reports them. */
export function storyReleaseDates(story: StoryReleaseFaceted): Partial<Record<GameServer, string>> {
  const dates: Partial<Record<GameServer, string>> = {};
  for (const server of story.servers) {
    const variant = story.serverVariants?.[server];
    const startAt = variant && Object.hasOwn(variant, "startAt") ? variant.startAt : story.startAt;
    if (typeof startAt === "string") dates[server] = startAt;
  }
  return dates;
}

/**
 * The story player and global story pages have no region selector at request time. Fail closed until every server
 * whose MasterData contains the story has reached its own in-game start time; a cloud upload or another region's
 * release is not sufficient evidence that this story is public everywhere it is listed.
 */
export function isReleaseFacetReleasedAcrossServers(story: StoryReleaseFaceted, now: number): boolean {
  if (story.servers.length === 0 || !Number.isFinite(now)) return false;
  const dates = storyReleaseDates(story);
  return story.servers.every((server) => isStoryReleasedAt(dates[server], now));
}

/** Whether one server's authoritative MasterData release date has passed. Unknown dates and absent regions fail closed. */
export function isReleaseFacetReleasedForServer(story: StoryReleaseFaceted, server: GameServer, now: number): boolean {
  if (!story.servers.includes(server)) return false;
  return isStoryReleasedAt(storyReleaseDates(story)[server], now);
}

/**
 * Keep only the server variants whose own in-game release date has passed. When the source's base server is not yet
 * released, promote the first released server's fields to the base so an unreleased variant is not serialized as the
 * fallback value. Used for region-switchable public catalog payloads.
 */
export function filterReleasedFacetsByServer<T extends { startAt: string }>(
  entries: readonly ServerFaceted<T>[],
  now: number,
): ServerFaceted<T>[] {
  if (!Number.isFinite(now)) return [];
  return entries.flatMap((entry) => {
    const releasedServers = entry.servers.filter((server) => isReleaseFacetReleasedForServer(entry, server, now));
    const safe = restrictFacetServers(entry, releasedServers);
    return safe ? [safe] : [];
  });
}

/** Story-specific name for the shared, regional MasterData release gate. */
export function isStoryReleasedAcrossServers(story: StoryReleaseFaceted, now: number): boolean {
  return isReleaseFacetReleasedAcrossServers(story, now);
}

/** Whether the authoritative MasterData for one specific server says the story is already in game. */
export function isStoryReleasedForServer(story: StoryReleaseFaceted, server: GameServer, now: number): boolean {
  if (!story.servers.includes(server)) return false;
  return isStoryReleasedAt(storyReleaseDates(story)[server], now);
}

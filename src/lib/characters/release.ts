import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import type { CharacterViewModel } from "@/lib/characters/data";
import { memo } from "@/lib/masterdata/build-core";
import { getBuildCards, getBuildStories, getBuildSupportCards } from "@/lib/masterdata/build-data";
import { isUntimedStoryCategory, parseStoryReleaseTime, storyReleaseDates } from "@/lib/story/release";
import { restrictFacetServers, type ServerFaceted } from "@/lib/servers/facets";

type CharacterReleaseSchedule = Map<number, Map<GameServer, number>>;

function recordReleaseTime(
  schedule: CharacterReleaseSchedule,
  characterId: number,
  server: GameServer,
  releaseAtMs: number | null,
): void {
  if (characterId <= 0 || releaseAtMs === null) return;
  let perServer = schedule.get(characterId);
  if (!perServer) {
    perServer = new Map<GameServer, number>();
    schedule.set(characterId, perServer);
  }
  const existing = perServer.get(server);
  if (existing === undefined || releaseAtMs < existing) {
    perServer.set(server, releaseAtMs);
  }
}

/** Precompute the earliest regional release timestamp per character once per MasterData epoch. */
function getBuildReleasedCharacterSchedule(): Promise<CharacterReleaseSchedule> {
  return memo("character-release-schedule", async () => {
    const [cards, supportCards, stories] = await Promise.all([
      getBuildCards(DEFAULT_LOCALE),
      getBuildSupportCards(DEFAULT_LOCALE),
      getBuildStories(DEFAULT_LOCALE),
    ]);
    const schedule: CharacterReleaseSchedule = new Map();
    for (const card of cards) {
      if (card.characterId <= 0) continue;
      const dates = storyReleaseDates(card);
      for (const server of card.servers) {
        recordReleaseTime(schedule, card.characterId, server, parseStoryReleaseTime(dates[server]));
      }
    }
    for (const card of supportCards) {
      if (card.characterIds.length === 0) continue;
      const dates = storyReleaseDates(card);
      for (const server of card.servers) {
        const releaseAtMs = parseStoryReleaseTime(dates[server]);
        if (releaseAtMs === null) continue;
        for (const characterId of card.characterIds) {
          recordReleaseTime(schedule, characterId, server, releaseAtMs);
        }
      }
    }
    for (const story of stories) {
      if (story.characterIds.length === 0) continue;
      if (isUntimedStoryCategory(story.category)) {
        for (const server of story.servers) {
          for (const characterId of story.characterIds) {
            recordReleaseTime(schedule, characterId, server, Number.NEGATIVE_INFINITY);
          }
        }
        continue;
      }
      const dates = storyReleaseDates(story);
      for (const server of story.servers) {
        const releaseAtMs = parseStoryReleaseTime(dates[server]);
        if (releaseAtMs === null) continue;
        for (const characterId of story.characterIds) {
          recordReleaseTime(schedule, characterId, server, releaseAtMs);
        }
      }
    }
    return schedule;
  });
}

/**
 * Characters are not authorized by MasterCharacter presence alone: that table can land before a new character is in
 * game. For each region, at least one officially released member/support card or story must refer to the character.
 */
export async function getBuildReleasedCharacterServers(_locale: AppLocale, now = Date.now()): Promise<Map<number, GameServer[]>> {
  if (!Number.isFinite(now)) return new Map();
  const schedule = await getBuildReleasedCharacterSchedule();
  const released = new Map<number, GameServer[]>();
  for (const [characterId, perServer] of schedule) {
    const servers: GameServer[] = [];
    for (const [server, releaseAtMs] of perServer) {
      if (releaseAtMs <= now) servers.push(server);
    }
    if (servers.length > 0) released.set(characterId, servers);
  }
  return released;
}

/** Regions in which the character has positive in-game release evidence; useful for route existence and names. */
export async function getBuildReleasedCharacterIds(locale: AppLocale, now = Date.now()): Promise<Set<number>> {
  return new Set((await getBuildReleasedCharacterServers(locale, now)).keys());
}

/** Remove MasterCharacter fields for regions with no released card/story evidence. */
export async function filterReleasedCharacterFacets(
  characters: readonly ServerFaceted<CharacterViewModel>[],
  releasedServers: ReadonlyMap<number, readonly GameServer[]>,
): Promise<ServerFaceted<CharacterViewModel>[]> {
  return characters.flatMap((character) => {
    const allowed = releasedServers.get(character.id) ?? [];
    const safe = restrictFacetServers(character, allowed);
    return safe ? [safe] : [];
  });
}

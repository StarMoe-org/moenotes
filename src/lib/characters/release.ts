import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import type { CharacterViewModel } from "@/lib/characters/data";
import { getBuildCards, getBuildCharacters, getBuildStories, getBuildSupportCards } from "@/lib/masterdata/build-data";
import { isReleaseFacetReleasedForServer } from "@/lib/story/release";
import { restrictFacetServers, type ServerFaceted } from "@/lib/servers/facets";

/**
 * Characters are not authorized by MasterCharacter presence alone: that table can land before a new character is in
 * game. For each region, at least one officially released member/support card or story must refer to the character.
 */
export async function getBuildReleasedCharacterServers(locale: AppLocale, now = Date.now()): Promise<Map<number, GameServer[]>> {
  const [cards, supportCards, stories] = await Promise.all([
    getBuildCards(locale),
    getBuildSupportCards(locale),
    getBuildStories(locale),
  ]);
  const released = new Map<number, Set<GameServer>>();
  const add = (characterId: number, server: GameServer) => {
    if (characterId <= 0) return;
    const servers = released.get(characterId) ?? new Set<GameServer>();
    servers.add(server);
    released.set(characterId, servers);
  };
  for (const card of cards) {
    if (card.characterId <= 0) continue;
    for (const server of card.servers) if (isReleaseFacetReleasedForServer(card, server, now)) add(card.characterId, server);
  }
  for (const card of supportCards) {
    for (const server of card.servers) {
      if (isReleaseFacetReleasedForServer(card, server, now)) {
        for (const characterId of card.characterIds) add(characterId, server);
      }
    }
  }
  for (const story of stories) {
    for (const server of story.servers) {
      if (isReleaseFacetReleasedForServer(story, server, now)) {
        for (const characterId of story.characterIds) add(characterId, server);
      }
    }
  }
  return new Map([...released].map(([id, servers]) => [id, [...servers]]));
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

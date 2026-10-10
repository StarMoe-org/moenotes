import { isChallengeInput, playsGekisou, solverGoalKind, usesEventData, usesEventItemRewards, type DeckArenaMusic, type DeckEvent, type DeckGoalInput } from "./goals";
import type { DeckDataCatalog } from "./worker-protocol";

export type DeckDataGap = "catalog" | "event" | "eventItemRewards" | "song" | "luck" | "missions" | null;

/** Check the selected scene's coverage and supported missions in the verified Worker data. */
export function deckDataGap(input: DeckGoalInput, event: DeckEvent | null, catalog: DeckDataCatalog | null,
  arenas: readonly DeckArenaMusic[] = []): DeckDataGap {
  if (!catalog) return "catalog";
  if (event && usesEventData(input) && !catalog.eventIds.includes(event.id)) return "event";
  if (usesEventItemRewards(input) && event) {
    const rewards = catalog.eventItemRewards?.find(row => row.id === event.id && row.itemId === event.itemId);
    if (!rewards || !(isChallengeInput(input) ? rewards.challenge : rewards.normal)) return "eventItemRewards";
  }
  const kind = solverGoalKind(input);
  let musicId: number | null;
  if (isChallengeInput(input)) {
    if (input.challengeMusicId === null) return null;
    const selected = event?.challengeMusics.find(row => row.id === input.challengeMusicId);
    if (!selected) return null;
    const available = catalog.challengeMusics.find(row => row.id === selected.id);
    if (!available || available.eventId !== event!.id || available.musicId !== selected.musicId) return "song";
    musicId = selected.musicId;
  } else if (kind === "arenaLive") {
    if (input.arenaMusicId === null) return null;
    const selected = arenas.find(row => row.id === input.arenaMusicId);
    const available = catalog.arenaMusics.find(row => row.id === input.arenaMusicId);
    if (!available || selected && available.musicId !== selected.musicId) return "song";
    musicId = available.musicId;
  } else {
    if (kind === "power" && !input.powerSong) return null;
    musicId = input.musicId;
  }
  if (musicId === null) return null;
  const music = catalog.musics.find(row => row.id === musicId);
  if (!music || kind !== "power" && !music.difficulties.includes(input.difficulty)) return "song";
  if (playsGekisou(input)) {
    if (music.hasLuck === true) return "luck";
    if (music.hasLuck !== false) return "missions";
  }
  return null;
}

import { challengeRateInput, isChallengeInput, playsGekisou, solverGoalKind, usesChallengeRate, usesEventData, usesEventItemRewards, type DeckArenaMusic, type DeckEvent, type DeckGoalInput, type DeckSolverCapabilities } from "./goals";
import type { DeckDataCatalog } from "./worker-protocol";

export type DeckDataGap = "catalog" | "event" | "eventItemRewards" | "song" | "luck" | "luckGreat" | "missions" | null;

/**
 * Check the selected scene's coverage and supported missions in the verified Worker data. A goal input that rates
 * challenge points by a challenge live needs that live covered as well. A Gekisou live with a LUCK mission needs an
 * engine that computes LUCK missions, and Great judgements there need its support for judgement conversions.
 */
export function deckDataGap(input: DeckGoalInput, event: DeckEvent | null, catalog: DeckDataCatalog | null,
  arenas: readonly DeckArenaMusic[] = [], capabilities: Pick<DeckSolverCapabilities, "luckMissions" | "luckGreatConversions"> | null = null): DeckDataGap {
  if (!catalog) return "catalog";
  if (event && usesEventData(input) && !catalog.eventIds.includes(event.id)) return "event";
  if (usesEventItemRewards(input) && event) {
    const rewards = catalog.eventItemRewards?.find(row => row.id === event.id && row.itemId === event.itemId);
    if (!rewards || !(isChallengeInput(input) ? rewards.challenge : rewards.normal)) return "eventItemRewards";
  }
  if (usesChallengeRate(input)) {
    const rate = deckDataGap(challengeRateInput(input), event, catalog, arenas, capabilities);
    if (rate) return rate;
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
  } else if (kind === "arenaLive" && input.arenaRule !== undefined) {
    if (!input.arenaRule) return null;
    const entries = input.arenaSongEntries && input.arenaSongEntries.length > 0
      ? input.arenaSongEntries
      : input.musicId !== null ? [{ musicId: input.musicId, difficulty: input.difficulty }] : [];
    const ruleMissions = input.arenaRule.missions;
    for (const entry of entries) {
      const music = catalog.musics.find(row => row.id === entry.musicId);
      if (!music || !music.difficulties.includes(entry.difficulty)) return "song";
      const hasOverrideLuck = ruleMissions.includes(2);
      const allOverriddenNonLuck = ruleMissions.every(m => m === 1 || m === 3);
      if (!hasOverrideLuck && !allOverriddenNonLuck && music.hasLuck === null) return "missions";
      const effectiveLuck = hasOverrideLuck ? true : allOverriddenNonLuck ? false : music.hasLuck === true;
      if (effectiveLuck && !capabilities?.luckMissions) return "luck";
      if (effectiveLuck && input.greatPercent > 0 && !capabilities?.luckGreatConversions) return "luckGreat";
    }
    return null;
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
  if (musicId === null) {
    if (playsGekisou(input) && input.songRules?.missions.includes(2)) {
      if (!capabilities?.luckMissions) return "luck";
      if (input.greatPercent > 0 && !capabilities?.luckGreatConversions) return "luckGreat";
    }
    return null;
  }
  const music = catalog.musics.find(row => row.id === musicId);
  if (!music || kind !== "power" && !music.difficulties.includes(input.difficulty)) return "song";
  if (playsGekisou(input)) {
    const ruleMissions = input.songRules?.missions;
    const hasOverrideLuck = ruleMissions?.includes(2) ?? false;
    const allOverriddenNonLuck = ruleMissions ? ruleMissions.every(m => m === 1 || m === 3) : false;
    if (!hasOverrideLuck && !allOverriddenNonLuck && music.hasLuck === null) return "missions";
    const effectiveLuck = hasOverrideLuck ? true : allOverriddenNonLuck ? false : music.hasLuck === true;
    if (effectiveLuck && !capabilities?.luckMissions) return "luck";
    if (effectiveLuck && input.greatPercent > 0 && !capabilities?.luckGreatConversions) return "luckGreat";
  }
  return null;
}

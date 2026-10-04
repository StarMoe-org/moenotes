import type { GameServer } from "@/config/servers";
import { PRIMARY_SERVER } from "@/config/servers";
import { eachServer, memo, table, texts, titleRow } from "@/lib/masterdata/build-core";
import { getVoiceTypeName } from "@/lib/characters/data";
import {
  collectVoiceLines,
  voiceLinesByCharacter,
  type CharacterVoicesPayload,
  type RawCharacterVoiceRow,
  type RawLiveCharacter,
  type RawLiveDialogueCommon,
  type RawLiveDialogueFixedPair,
  type RawLiveGekisouVoice,
  type RawLiveStartCharacterVoice,
  type RawMemberCardVoice,
  type RawTalk,
  type VoiceLine,
} from "@/lib/characters/voices";
import type { RawText } from "@/lib/cards/data";
import { MASTER_TEXT_FIELDS, isUsableMasterText } from "@/lib/masterdata/localize-text";

/*
 * Build-time data of the character page's voice section: `/character-voices.json` (src/pages/character-voices.json.ts).
 */

const empty = <T>() => ({ _allData: [] as T[] });

/** `<cue sheet>/<cue>` of a server's MasterSound ids ("" when the sound or its sheet is unknown). */
function soundPathsOn(server: GameServer): Promise<(soundId: number) => string> {
  return memo(`sound-paths:${server}`, async () => {
    const [sounds, sheets] = await Promise.all([
      table<{ id: number; cueName: string; soundCueSheetID: number }>("MasterSound.json", server).catch(() => empty<{ id: number; cueName: string; soundCueSheetID: number }>()),
      table<{ id: number; cueSheetName: string }>("MasterSoundCueSheet.json", server).catch(() => empty<{ id: number; cueSheetName: string }>()),
    ]);
    const sheetNames = new Map(sheets._allData.map((sheet) => [sheet.id, sheet.cueSheetName]));
    const soundMap = new Map(sounds._allData.map((sound) => [sound.id, sound]));
    return (soundId: number) => {
      const sound = soundMap.get(soundId);
      const sheet = sound ? sheetNames.get(sound.soundCueSheetID) : undefined;
      return sound?.cueName && sheet ? `${sheet}/${sound.cueName}` : "";
    };
  });
}

/** Every voice line one server has (new tables read as empty where a server lacks or breaks them). */
export function voiceLinesOn(server: GameServer): Promise<VoiceLine[]> {
  return memo(`voice-lines:${server}`, async () => {
    const [talks, characterVoices, memberCards, liveCharacters, gekisouVoices, dialogueCommons, dialoguePairs, liveStarts, soundOf] = await Promise.all([
      table<RawTalk>("MasterTalk.json", server).catch(() => empty<RawTalk>()),
      table<RawCharacterVoiceRow>("MasterCharacterVoice.json", server).catch(() => empty<RawCharacterVoiceRow>()),
      table<RawMemberCardVoice>("MasterMemberCard.json", server).catch(() => empty<RawMemberCardVoice>()),
      table<RawLiveCharacter>("MasterLiveCharacter.json", server).catch(() => empty<RawLiveCharacter>()),
      table<RawLiveGekisouVoice>("MasterLiveGekisouVoice.json", server).catch(() => empty<RawLiveGekisouVoice>()),
      table<RawLiveDialogueCommon>("MasterLiveDialogueCommon.json", server).catch(() => empty<RawLiveDialogueCommon>()),
      table<RawLiveDialogueFixedPair>("MasterLiveDialogueFixedPair.json", server).catch(() => empty<RawLiveDialogueFixedPair>()),
      table<RawLiveStartCharacterVoice>("MasterLiveStartCharacterVoice.json", server).catch(() => empty<RawLiveStartCharacterVoice>()),
      soundPathsOn(server),
    ]);
    return collectVoiceLines({
      talks: talks._allData,
      characterVoices: characterVoices._allData,
      memberCards: memberCards._allData,
      liveCharacters: liveCharacters._allData,
      gekisouVoices: gekisouVoices._allData,
      dialogueCommons: dialogueCommons._allData,
      dialoguePairs: dialoguePairs._allData,
      liveStarts: liveStarts._allData,
    }, soundOf, getVoiceTypeName);
  });
}

/**
 * Body of `/character-voices.json`: each server's lines by character, identical servers sharing one set, and the
 * five language cells of every text they reference. A text id is looked up in the server's own cross-filled
 * MasterText first (JP-only lines read in Japanese), then the primary server's.
 */
export function getBuildCharacterVoices(): Promise<CharacterVoicesPayload> {
  return memo("character-voices", async () => {
    const payload: CharacterVoicesPayload = { texts: {}, sets: [], servers: {} };
    const setIndexByJson = new Map<string, number>();
    const perServer = await eachServer(async (server) => [await voiceLinesOn(server), await texts(server)] as const);
    const primaryRows = new Map((await texts(PRIMARY_SERVER))._allData.map((row) => [row.id, row]));
    for (const [server, [lines, textTable]] of perServer) {
      const set = voiceLinesByCharacter(lines);
      const json = JSON.stringify(set);
      let index = setIndexByJson.get(json);
      if (index === undefined) {
        index = payload.sets.push(set) - 1;
        setIndexByJson.set(json, index);
      }
      payload.servers[server] = index;
      const rows = new Map<string, RawText>(textTable._allData.map((row) => [row.id, row]));
      for (const line of lines) {
        for (const id of [line.text, line.partnerText]) {
          if (!id || payload.texts[id]) continue;
          const row = titleRow(rows, id);
          const fallback = row.id ? row : titleRow(primaryRows, id);
          if (fallback.id) payload.texts[id] = compactText(fallback);
        }
      }
    }
    return payload;
  });
}

/** A MasterText row without the id and without cells that hold no copy (the id is the payload key). */
function compactText(row: ReturnType<typeof titleRow>): ReturnType<typeof titleRow> {
  const out: ReturnType<typeof titleRow> = {};
  for (const field of MASTER_TEXT_FIELDS) {
    const value = row[field];
    if (isUsableMasterText(value, row.id)) out[field] = value;
  }
  return out;
}

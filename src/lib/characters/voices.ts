import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { getVoiceAudioUrl } from "@/lib/assets/voice";
import { localizeMasterText, type LocalizableMasterText } from "@/lib/masterdata/localize-text";

/*
 * Every voice line of a character, from the eight MasterData tables the game reads them from. The build turns the
 * tables into `/character-voices.json` (one file for every locale and server, see CharacterVoicesPayload); the
 * character page fetches it when its voice section first opens and groups one character's lines for its server.
 */

/** The voice sources in the order the page lists them. */
export const VOICE_SOURCES = [
  "talk",
  "characterVoice",
  "memberCard",
  "liveStart",
  "liveCharacter",
  "liveGekisou",
  "liveDialogueCommon",
  "liveDialogueFixedPair",
] as const;
export type VoiceSource = typeof VOICE_SOURCES[number];

/** MasterTalk lines split by when the home screen plays them. */
export type TalkKind = "normal" | "seasonal" | "birthday";

/** MasterLiveGekisouVoice `_gekisouVoiceType` (StartCombo / StartJustCount / StartLuck / TopRank). */
export const GEKISOU_VOICE_TYPES = ["combo", "just", "luck", "top"] as const;
/** MasterLiveDialogueCommon / FixedPair `_dialogueType` (1 Combo, 2 LiveSkill). */
export const LIVE_DIALOGUE_TYPES: Readonly<Record<number, string>> = { 1: "combo", 2: "skill" };

// ---- Raw rows (leading `_` stripped by validateMasterTable). Key spellings vary by table; both are accepted. ----

export interface RawTalk {
  id: number;
  characterId?: number;
  characterID?: number;
  category: number;
  textId: string;
  voiceSoundId: number;
  birthdayCharacterId?: number;
  seasonStartAt?: string;
  seasonEndAt?: string;
  unlockCharacterRank?: number;
}

export interface RawCharacterVoiceRow {
  id: number;
  characterId?: number;
  characterID?: number;
  type: number;
  textId: string;
  soundId: number;
  scoreRank?: number;
}

export interface RawMemberCardVoice {
  id: number;
  characterID?: number;
  characterId?: number;
  gachaVoiceTextId?: string;
  gachaVoiceSoundId?: number;
}

export interface RawLiveCharacter {
  id: number;
  characterID?: number;
  characterId?: number;
  liveSkillVoiceTextID?: string;
  liveSkillVoiceTextId?: string;
  liveSkillVoiceSoundID?: number;
  liveSkillVoiceSoundId?: number;
}

export interface RawLiveGekisouVoice {
  id: number;
  characterID?: number;
  characterId?: number;
  gekisouVoiceType: number;
  voiceTextID?: string;
  voiceTextId?: string;
  voiceID?: number;
  voiceId?: number;
}

export interface RawLiveDialogueCommon {
  id: number;
  characterID?: number;
  characterId?: number;
  dialogueType: number;
  comboVoiceTextID?: string;
  comboVoiceTextId?: string;
  comboVoiceSoundID?: number;
  comboVoiceSoundId?: number;
}

export interface RawLiveDialogueFixedPair {
  id: number;
  dialogueType: number;
  characterID01?: number;
  characterId01?: number;
  characterID02?: number;
  characterId02?: number;
  character01ComboVoiceTextID?: string;
  character01ComboVoiceTextId?: string;
  character01ComboVoiceSoundID?: number;
  character01ComboVoiceSoundId?: number;
  character02ComboVoiceTextID?: string;
  character02ComboVoiceTextId?: string;
  character02ComboVoiceSoundID?: number;
  character02ComboVoiceSoundId?: number;
  unlockFriendshipRank?: number;
}

export interface RawLiveStartCharacterVoice {
  id: number;
  characterId?: number;
  characterID?: number;
  voiceTextId?: string;
  voiceTextID?: string;
  voiceSoundId?: number;
  voiceSoundID?: number;
  unlockCharacterRank?: number;
}

export interface VoiceTables {
  talks: readonly RawTalk[];
  characterVoices: readonly RawCharacterVoiceRow[];
  memberCards: readonly RawMemberCardVoice[];
  liveCharacters: readonly RawLiveCharacter[];
  gekisouVoices: readonly RawLiveGekisouVoice[];
  dialogueCommons: readonly RawLiveDialogueCommon[];
  dialoguePairs: readonly RawLiveDialogueFixedPair[];
  liveStarts: readonly RawLiveStartCharacterVoice[];
}

// ---- Lines ----

/**
 * One voice line. `text` is a MasterText id (resolved through the payload's `texts`), `sound` the line's audio as
 * `<cue sheet>/<cue>` ("" when the sound row is unknown); see voiceAudioPath.
 */
export interface VoiceLine {
  source: VoiceSource;
  /** Row id within its source table. */
  id: number;
  /** The character speaking the line. */
  characterId: number;
  text: string;
  sound: string;
  /** Source-specific label: a CHARACTER_VOICE_TYPES name, a TalkKind, a gekisou / dialogue type name. */
  kind?: string;
  /** MasterCharacterVoice `scoreRank` of a result line (2 D … 7 SS). */
  scoreRank?: number;
  /** MasterTalk / MasterLiveStartCharacterVoice unlock rank. */
  unlockRank?: number;
  /** MasterTalk season window ("4/1"–"4/30"). */
  seasonStart?: string;
  seasonEnd?: string;
  /** MasterTalk birthday line: whose birthday it celebrates. */
  birthdayCharacterId?: number;
  /** Member-card gacha voice: the card. */
  cardId?: number;
  /** Pair dialogue: the other character, and whether this line opens (1) or answers (2) the exchange. */
  partnerId?: number;
  pairOrder?: 1 | 2;
  /** Pair dialogue: the partner's line (text id / sound), so either character's page shows the whole exchange. */
  partnerText?: string;
  partnerSound?: string;
  /** Pair dialogue: bond rank the exchange unlocks at. */
  unlockFriendshipRank?: number;
}

const num = (...values: Array<number | undefined>): number => values.find((value) => typeof value === "number") ?? 0;
const str = (...values: Array<string | undefined>): string => values.find((value) => typeof value === "string" && value !== "") ?? "";

/** CHARACTER_VOICE_TYPES name of a MasterCharacterVoice `type` (see characters/data.ts). */
export type CharacterVoiceTypeName = (type: number) => string;

function talkKind(row: RawTalk): TalkKind {
  if (num(row.birthdayCharacterId) > 0) return "birthday";
  if (row.seasonStartAt || row.seasonEndAt) return "seasonal";
  return "normal";
}

/**
 * Every line of every character, flattened. Pair dialogues yield one line per side: the opening line on the first
 * character's page and the answer on the second's, each carrying the other side so the exchange reads whole.
 * `soundOf` turns a MasterSound id into `<sheet>/<cue>` ("" when unknown).
 */
export function collectVoiceLines(tables: VoiceTables, soundOf: (soundId: number) => string, voiceTypeName: CharacterVoiceTypeName): VoiceLine[] {
  const lines: VoiceLine[] = [];
  for (const row of tables.talks) {
    const kind = talkKind(row);
    lines.push({
      source: "talk", id: row.id, characterId: num(row.characterId, row.characterID), text: row.textId, sound: soundOf(row.voiceSoundId), kind,
      ...(num(row.unlockCharacterRank) > 0 ? { unlockRank: num(row.unlockCharacterRank) } : {}),
      ...(kind === "seasonal" ? { seasonStart: row.seasonStartAt ?? "", seasonEnd: row.seasonEndAt ?? "" } : {}),
      ...(kind === "birthday" ? { birthdayCharacterId: num(row.birthdayCharacterId) } : {}),
    });
  }
  for (const row of tables.characterVoices) {
    lines.push({
      source: "characterVoice", id: row.id, characterId: num(row.characterId, row.characterID), text: row.textId, sound: soundOf(row.soundId), kind: voiceTypeName(row.type),
      ...(num(row.scoreRank) > 0 ? { scoreRank: num(row.scoreRank) } : {}),
    });
  }
  for (const row of tables.memberCards) {
    const text = str(row.gachaVoiceTextId);
    const soundId = num(row.gachaVoiceSoundId);
    if (!text && !soundId) continue;
    lines.push({ source: "memberCard", id: row.id, characterId: num(row.characterID, row.characterId), text, sound: soundId ? soundOf(soundId) : "", cardId: row.id });
  }
  for (const row of tables.liveStarts) {
    lines.push({
      source: "liveStart", id: row.id, characterId: num(row.characterId, row.characterID), text: str(row.voiceTextId, row.voiceTextID), sound: soundOf(num(row.voiceSoundId, row.voiceSoundID)),
      ...(num(row.unlockCharacterRank) > 0 ? { unlockRank: num(row.unlockCharacterRank) } : {}),
    });
  }
  for (const row of tables.liveCharacters) {
    lines.push({ source: "liveCharacter", id: row.id, characterId: num(row.characterID, row.characterId), text: str(row.liveSkillVoiceTextID, row.liveSkillVoiceTextId), sound: soundOf(num(row.liveSkillVoiceSoundID, row.liveSkillVoiceSoundId)) });
  }
  for (const row of tables.gekisouVoices) {
    lines.push({
      source: "liveGekisou", id: row.id, characterId: num(row.characterID, row.characterId), text: str(row.voiceTextID, row.voiceTextId), sound: soundOf(num(row.voiceID, row.voiceId)),
      kind: GEKISOU_VOICE_TYPES[row.gekisouVoiceType] ?? "other",
    });
  }
  for (const row of tables.dialogueCommons) {
    lines.push({
      source: "liveDialogueCommon", id: row.id, characterId: num(row.characterID, row.characterId), text: str(row.comboVoiceTextID, row.comboVoiceTextId), sound: soundOf(num(row.comboVoiceSoundID, row.comboVoiceSoundId)),
      kind: LIVE_DIALOGUE_TYPES[row.dialogueType] ?? "other",
    });
  }
  for (const row of tables.dialoguePairs) {
    const first = num(row.characterID01, row.characterId01);
    const second = num(row.characterID02, row.characterId02);
    const firstText = str(row.character01ComboVoiceTextID, row.character01ComboVoiceTextId);
    const firstSound = soundOf(num(row.character01ComboVoiceSoundID, row.character01ComboVoiceSoundId));
    const secondText = str(row.character02ComboVoiceTextID, row.character02ComboVoiceTextId);
    const secondSound = soundOf(num(row.character02ComboVoiceSoundID, row.character02ComboVoiceSoundId));
    const kind = LIVE_DIALOGUE_TYPES[row.dialogueType] ?? "other";
    const unlock = num(row.unlockFriendshipRank) > 0 ? { unlockFriendshipRank: num(row.unlockFriendshipRank) } : {};
    lines.push({ source: "liveDialogueFixedPair", id: row.id, characterId: first, text: firstText, sound: firstSound, kind, partnerId: second, pairOrder: 1, partnerText: secondText, partnerSound: secondSound, ...unlock });
    lines.push({ source: "liveDialogueFixedPair", id: row.id, characterId: second, text: secondText, sound: secondSound, kind, partnerId: first, pairOrder: 2, partnerText: firstText, partnerSound: firstSound, ...unlock });
  }
  return lines;
}

/** One server's lines by character id (each character's lines in source order). */
export function voiceLinesByCharacter(lines: readonly VoiceLine[]): Record<string, VoiceLine[]> {
  const out: Record<string, VoiceLine[]> = {};
  for (const line of lines) {
    if (!line.characterId) continue;
    (out[String(line.characterId)] ??= []).push(line);
  }
  return out;
}

// ---- Payload (`/character-voices.json`) ----

/**
 * Body of `/character-voices.json`. Servers whose lines serialize identically share one `sets` entry (the
 * international servers share MasterData); `servers` maps a server to its set. `texts` holds every referenced
 * MasterText row with its five language cells, so one file serves every locale.
 */
export interface CharacterVoicesPayload {
  texts: Record<string, LocalizableMasterText>;
  sets: Array<Record<string, VoiceLine[]>>;
  servers: Partial<Record<GameServer, number>>;
}

/** A character's lines as `server` has them; the first listed server's when that server has no set. */
export function characterVoiceLines(payload: CharacterVoicesPayload, server: GameServer, characterId: number): VoiceLine[] {
  const index = payload.servers[server] ?? Object.values(payload.servers)[0];
  const set = index === undefined ? undefined : payload.sets[index];
  return set?.[String(characterId)] ?? [];
}

/**
 * The release URL (default region form) of a line's `<sheet>/<cue>` sound; "" without one. Pages move it to their
 * server with `useAssetUrl` like every other file.
 */
export function voiceAudioUrl(sound: string | undefined, locale: AppLocale): string {
  const slash = sound ? sound.indexOf("/") : -1;
  if (!sound || slash <= 0) return "";
  return getVoiceAudioUrl(0, sound.slice(slash + 1), sound.slice(0, slash), locale);
}

/** The localized text of a line's MasterText id ("" when unknown). */
export function voiceText(payload: Pick<CharacterVoicesPayload, "texts">, textId: string | undefined, locale: AppLocale): string {
  if (!textId) return "";
  return localizeMasterText(payload.texts[textId], locale);
}

// ---- Grouping for the page ----

export interface VoiceGroup {
  source: VoiceSource;
  /** Sub-groups (MasterTalk's normal / seasonal / birthday); a single unnamed one elsewhere. */
  sections: Array<{ kind: string | null; lines: VoiceLine[] }>;
}

const TALK_ORDER: readonly TalkKind[] = ["normal", "seasonal", "birthday"];

/** A character's lines grouped by source in VOICE_SOURCES order; empty sources are left out. */
export function groupVoiceLines(lines: readonly VoiceLine[]): VoiceGroup[] {
  const bySource = new Map<VoiceSource, VoiceLine[]>();
  for (const line of lines) {
    const list = bySource.get(line.source) ?? [];
    list.push(line);
    bySource.set(line.source, list);
  }
  const groups: VoiceGroup[] = [];
  for (const source of VOICE_SOURCES) {
    const list = bySource.get(source);
    if (!list?.length) continue;
    if (source === "talk") {
      groups.push({
        source,
        sections: TALK_ORDER.map((kind) => ({ kind, lines: list.filter((line) => line.kind === kind) })).filter((section) => section.lines.length > 0),
      });
    } else {
      groups.push({ source, sections: [{ kind: null, lines: list }] });
    }
  }
  return groups;
}

import {
  getStoryBackgroundUrl,
  getStoryBgmUrl,
  getStoryChatIconUrl,
  getStoryScriptTableUrl,
  getStorySeUrl,
  getStoryStillUrl,
  getStoryVideoUrl,
  getStoryVoiceUrl,
  type StoryScriptTable,
} from "@/lib/story/assets";
import { fetchReleaseJson } from "@/lib/assets/release";
import { parseRichText, plainRichText, type StoryTextRun } from "@/lib/story/rich-text";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export type StoryLocale =
  | "ja-JP"
  | "en-US"
  | "zh-CN"
  | "zh-TW"
  | "ko-KR"
  | "th-TH"
  | "id-ID"
  | "vi-VN"
  | "es-ES"
  | "pt-BR"
  | "fr-FR"
  | "de-DE"
  | "ru-RU";

export interface StoryLine {
  index: number;
  /** A telop is the game's time/place card ("the next morning", a location), shown centered rather than as narration. */
  kind: "dialogue" | "telop" | "chat";
  speakerId: string;
  speaker: string;
  textId: string;
  text: string;
  voiceUrls: string[];
  /** Styled runs when the text has size, emphasis or furigana markup; `text` is always plain. */
  rich?: StoryTextRun[];
  /** Set on lines spoken over a clip (its StoryVideo id); they are the clip's subtitles and have no voice files. */
  videoId?: number;
  /** When a clip line is on screen, in seconds from the clip's start. */
  cue?: { start: number; end: number };
  /** Set on phone-chat messages. */
  chat?: StoryChatMessage;
}

export interface StoryChatMessage {
  /** Counts chat windows in the script, so one window's messages group together. */
  thread: number;
  /** The window's contact or group name. */
  title: string;
  /** Sent by the phone's owner. */
  outgoing: boolean;
  iconUrl?: string;
}

export interface StoryVideo {
  id: number;
  url: string;
  /** Scene note from the script's Video table, written in Japanese by the game's authors. */
  note: string;
  width: number;
  height: number;
}

/** Lines and the backgrounds, stills and clips between them, in script order. A blank entry is a black or white screen. */
export type StoryTimelineEntry =
  | { kind: "line"; line: number }
  | { kind: "background"; url: string; name?: string }
  | { kind: "blank" }
  | { kind: "still"; url: string; caption?: string }
  | { kind: "video"; video: StoryVideo };

export interface ParsedStoryScript {
  scriptName: string;
  locale: StoryLocale;
  lines: StoryLine[];
  timeline: StoryTimelineEntry[];
  backgrounds: string[];
  stills: string[];
  bgmUrls: string[];
  seUrls: string[];
}

/** Localized MasterBiliAnimeStillSubTitle row: a translation of the text drawn in an anime still. */
export interface StoryStillCaption {
  assetName: string;
  /** Episode row indices the still is shown between. */
  open: number;
  close: number;
  text: string;
}

/** MasterData the script tables refer to; parsing works without them, minus avatars, chat sides and captions. */
export interface StoryScriptLookups {
  /** MasterAdvChat id → chat icon asset name. */
  chatIcons?: Readonly<Record<string, string>>;
  stillCaptions?: readonly StoryStillCaption[];
}

interface NormalizedTable<T> {
  header: unknown[];
  allData: T[];
}

interface StoryTableCacheState {
  tables: Map<string, Promise<NormalizedTable<unknown>>>;
}

const storyTableCacheKey = Symbol.for("moenotes.story.build-tables");
const storyTableGlobal = globalThis as typeof globalThis & { [storyTableCacheKey]?: StoryTableCacheState };
const storyTableCache = storyTableGlobal[storyTableCacheKey] ??= { tables: new Map() };

interface EpisodeRow {
  index?: number;
  command?: number;
  targetName?: string;
  targetAssetName?: string;
  targetTextIDs?: string[];
  targetChatID?: number;
  advTextID?: string;
  parameter3?: string;
  duration?: number;
  isNoWait?: boolean;
  voiceIDs?: Array<string | number>;
  bgmID?: string | number;
  seID?: string | number;
  videoID?: number;
}

// Episode commands read here; the others drive Live2D models, the camera and screen effects.
const Command = {
  dialogue: 2,
  /** A time/place card; the first one after a background change names the scene. */
  telop: 20,
  background: 25,
  /** Plays a clip; its subtitle lines follow. */
  clip: 26,
  /** Plays a clip, or with parameter3 "SkipClipTarget" (and no video ID) marks where a skipped clip resumes. */
  skippableClip: 27,
  clipLine: 28,
  /** Shows a still, or hides the still currently shown when it names that still again. */
  still: 30,
  /** Opens a phone-chat window, or closes the one it names. */
  chatWindow: 36,
  chatMessage: 37,
  /** A message the phone's owner types. */
  chatReply: 65,
} as const;

/** Katakana middle dot (U+30FB): joins the models of a line several characters speak together, as in arale + ritsu. */
const SPEAKER_SEPARATOR = String.fromCharCode(0x30fb);

const TEXT_COMMANDS = new Set<number>([Command.dialogue, Command.telop, Command.clipLine, Command.chatMessage, Command.chatReply]);

// Solid-color stages (their published WebP is a few dozen bytes): white (217, and 333 behind every home and
// after-live talk) and black (218) screens. They show nothing, so they only mark a scene break.
const BLANK_STAGES = new Set(["adv_bkg_stage_000217", "adv_bkg_stage_000218", "adv_bkg_stage_000333"]);

interface TextRow {
  id?: string;
  japanese?: string;
  english?: string;
  traditionalChinese?: string;
  simplifiedChinese?: string;
  korean?: string;
}

interface SoundRow {
  id?: string | number;
  soundCueSheetID?: string | number;
  cueName?: string;
}

interface SoundCueSheetRow {
  id?: string | number;
  cueSheetName?: string;
}

interface VideoRow {
  id?: number;
  assetName?: string;
  width?: number;
  height?: number;
  note?: string;
}

export interface ParseStoryOptions {
  locale?: StoryLocale;
  fetcher?: typeof fetch;
  lookups?: StoryScriptLookups;
}

export async function fetchAndParseStory(scriptName: string, options: ParseStoryOptions = {}): Promise<ParsedStoryScript> {
  const locale = options.locale ?? "ja-JP";
  const fetcher = options.fetcher ?? fetch;
  const episodeRequest = fetchStoryTable<EpisodeRow>(scriptName, "Episode", locale, fetcher);
  const [episode, text, sound, cueSheets] = await Promise.all([
    episodeRequest,
    fetchStoryTable<TextRow>(scriptName, "Text", locale, fetcher),
    fetchStoryTable<SoundRow>(scriptName, "Sound", locale, fetcher),
    fetchStoryTable<SoundCueSheetRow>(scriptName, "SoundCueSheet", locale, fetcher),
  ]);
  // Few scripts play clips, so their Video table is only requested when a row refers to one.
  const video = episode.allData.some((row) => row.videoID)
    ? await fetchStoryTable<VideoRow>(scriptName, "Video", locale, fetcher)
    : undefined;

  return parseStoryTables(scriptName, { episode, text, sound, cueSheets, video }, locale, options.lookups);
}

export function parseStoryTables(
  scriptName: string,
  tables: {
    episode: NormalizedTable<EpisodeRow>;
    text: NormalizedTable<TextRow>;
    sound: NormalizedTable<SoundRow>;
    cueSheets: NormalizedTable<SoundCueSheetRow>;
    video?: NormalizedTable<VideoRow> | undefined;
  },
  locale: StoryLocale = "ja-JP",
  lookups: StoryScriptLookups = {},
): ParsedStoryScript {
  const texts = new Map(tables.text.allData.map((row) => [String(row.id ?? ""), row]));
  const sounds = new Map(tables.sound.allData.map((row) => [String(row.id ?? ""), row]));
  const cueSheets = new Map(tables.cueSheets.allData.map((row) => [String(row.id ?? ""), row]));
  const videoRows = new Map((tables.video?.allData ?? []).map((row) => [row.id ?? 0, row]));
  const lines: StoryLine[] = [];
  const timeline: StoryTimelineEntry[] = [];
  const backgrounds = new Set<string>();
  const stills = new Set<string>();
  const bgmUrls = new Set<string>();
  const seUrls = new Set<string>();

  const textOf = (id: string) => {
    const row = texts.get(id);
    return row ? localizeText(row, locale) : "";
  };
  // Clip lines name the speaker only by model (targetName); dialogue rows of the same script map models to name text.
  const speakerIdsByModel = new Map<string, string[]>();
  for (const row of tables.episode.allData) {
    if (row.command === Command.dialogue && row.targetName && row.targetTextIDs?.length && !speakerIdsByModel.has(row.targetName)) {
      speakerIdsByModel.set(row.targetName, row.targetTextIDs);
    }
  }
  const namesOf = (ids: string[]) => ids.map((id) => plainRichText(textOf(id))).filter(Boolean).join(SPEAKER_SEPARATOR);
  // Chat replies name their sender by a text ID (advchat_miku_01); clip lines by model (raika → adv_raika).
  const modelName = (model: string) => namesOf(speakerIdsByModel.get(model) ?? []) || textOf(model) || textOf(`adv_${model}`) || model;
  const speakerOf = (row: EpisodeRow) => namesOf(row.targetTextIDs ?? []) || (row.targetName ? row.targetName.split(SPEAKER_SEPARATOR).map(modelName).join(SPEAKER_SEPARATOR) : "");
  const chatIconUrl = (chatId: number | undefined) => {
    const icon = chatId ? lookups.chatIcons?.[String(chatId)] : undefined;
    return icon ? getStoryChatIconUrl(icon) : undefined;
  };

  // A background shows once a line is spoken over it, so the fades a scene change passes through are skipped.
  // null is a blank (black or white) screen.
  let pendingBackground: string | null | undefined;
  let shownBackground: string | null | undefined;
  let shownStill: string | undefined;
  // Scenes flash a still off and on around lines; it shows again only after the background changes.
  let lastStill: string | undefined;
  let clipId: number | undefined;
  // Clip subtitles are timed by the waits between them: each row that blocks the script (not IsNoWait) lasts its Duration.
  let clipTime = 0;
  let openCue: { start: number; end: number } | undefined;
  const closeCue = (time: number) => {
    if (openCue) openCue.end = Math.max(openCue.start, time);
    openCue = undefined;
  };
  type ChatWindow = { model: string; thread: number; title: string; ownerIconUrl: string | undefined; queued?: boolean };
  let chatWindow: ChatWindow | undefined;
  let chatThreads = 0;
  const openChatWindow = (row: EpisodeRow | undefined): ChatWindow => ({
    model: row?.targetName ?? "",
    thread: ++chatThreads,
    title: namesOf(row?.targetTextIDs ?? []),
    ownerIconUrl: chatIconUrl(row?.targetChatID),
  });
  // A reopened window replays its history, and a typed reply is sent as a message right after; neither is repeated.
  const chatMessageThreads = new Map<string, number>();
  let lastChatMessage: string | undefined;
  const rows = tables.episode.allData;

  for (const [position, row] of rows.entries()) {
    const rowTime = Math.round(clipTime * 100) / 100;
    // A subtitle stays up until the next clip line replaces or clears it (a clip line without text).
    if (clipId !== undefined && row.command === Command.clipLine) closeCue(rowTime);
    switch (row.command) {
      case Command.background: {
        if (!row.targetAssetName) break;
        if (BLANK_STAGES.has(row.targetAssetName.split("/").at(-1) ?? "")) {
          pendingBackground = null;
          lastStill = undefined;
          break;
        }
        const url = getStoryBackgroundUrl(row.targetAssetName);
        if (url) {
          pendingBackground = url;
          backgrounds.add(url);
        }
        break;
      }
      case Command.still: {
        if (!row.targetAssetName) break;
        if (row.targetAssetName === shownStill) {
          shownStill = undefined;
          break;
        }
        shownStill = row.targetAssetName;
        const url = getStoryStillUrl(row.targetAssetName);
        if (!url) break;
        stills.add(url);
        if (url === lastStill) break;
        lastStill = url;
        const index = row.index ?? -1;
        const caption = lookups.stillCaptions?.find((entry) => entry.assetName === row.targetAssetName && entry.open <= index && index <= entry.close)?.text;
        timeline.push(caption ? { kind: "still", url, caption } : { kind: "still", url });
        break;
      }
      case Command.clip:
      case Command.skippableClip: {
        const videoRow = row.videoID ? videoRows.get(row.videoID) : undefined;
        const url = videoRow?.assetName ? getStoryVideoUrl(videoRow.assetName, locale) : undefined;
        if (videoRow && url) {
          closeCue(rowTime);
          clipId = row.videoID;
          clipTime = 0;
          timeline.push({
            kind: "video",
            video: { id: row.videoID!, url, note: videoRow.note ?? "", width: videoRow.width ?? 1920, height: videoRow.height ?? 1080 },
          });
        } else if (row.parameter3 === "SkipClipTarget") {
          closeCue(rowTime);
          clipId = undefined;
        }
        break;
      }
      case Command.chatWindow: {
        const model = row.targetName ?? "";
        if (chatWindow?.model !== model) chatWindow = openChatWindow(row);
        else if (chatWindow.queued) chatWindow.queued = false;
        else chatWindow = undefined;
        break;
      }
    }

    if (clipId !== undefined && !row.isNoWait) clipTime += row.duration ?? 0;

    collectSoundUrl(row.bgmID, cueSheets, (name) => getStoryBgmUrl(name, locale), bgmUrls);
    collectSoundUrl(row.seID, cueSheets, (name) => getStorySeUrl(name, locale), seUrls);

    if (!TEXT_COMMANDS.has(row.command ?? -1) || !row.advTextID) continue;
    const { text, runs } = parseRichText(textOf(row.advTextID));
    if (!text.trim()) continue;
    const speakerId = row.targetTextIDs?.[0] ?? row.targetName ?? "";
    const speaker = speakerOf(row);

    let chat: StoryChatMessage | undefined;
    if (row.command === Command.chatMessage || row.command === Command.chatReply) {
      // A message can arrive just before its window opens; it belongs to the next window.
      const window = chatWindow ??= {
        ...openChatWindow(rows.slice(position + 1).find((next) => next.command === Command.chatWindow)),
        queued: true,
      };
      const messageKey = `${window.title}\n${speaker}\n${text}`;
      const firstThread = chatMessageThreads.get(messageKey);
      if (firstThread !== undefined && (firstThread !== window.thread || lastChatMessage === messageKey)) continue;
      chatMessageThreads.set(messageKey, window.thread);
      lastChatMessage = messageKey;
      const iconUrl = row.command === Command.chatReply ? window.ownerIconUrl : chatIconUrl(row.targetChatID);
      chat = {
        thread: window.thread,
        title: window.title,
        outgoing: row.command === Command.chatReply || (window.ownerIconUrl !== undefined && iconUrl === window.ownerIconUrl),
        ...(iconUrl ? { iconUrl } : {}),
      };
    }

    const voiceUrls = (row.voiceIDs ?? []).flatMap((voiceId) => {
      const soundRow = sounds.get(String(voiceId));
      if (!soundRow?.cueName || soundRow.soundCueSheetID === undefined) return [];
      const cueSheet = cueSheets.get(String(soundRow.soundCueSheetID));
      if (!cueSheet?.cueSheetName) return [];
      const url = getStoryVoiceUrl({
        scriptName,
        cueName: soundRow.cueName,
        cueSheetName: cueSheet.cueSheetName,
        soundId: soundRow.id ?? voiceId,
      }, locale);
      return url ? [url] : [];
    });

    const videoId = row.command === Command.clipLine ? clipId : undefined;
    // A clip covers the scene, so its subtitles stay with it and the background waits for the next spoken line.
    if (videoId === undefined && pendingBackground !== undefined) {
      // A blank screen only counts once a background has shown; after one, the next scene shows its background again.
      if (pendingBackground !== shownBackground && (pendingBackground !== null || typeof shownBackground === "string")) {
        const name = row.command === Command.telop ? text.trim() : "";
        timeline.push(pendingBackground === null
          ? { kind: "blank" }
          : name ? { kind: "background", url: pendingBackground, name } : { kind: "background", url: pendingBackground });
        shownBackground = pendingBackground;
        lastStill = undefined;
      }
      pendingBackground = undefined;
    }
    const cue = videoId !== undefined ? { start: rowTime, end: rowTime } : undefined;
    if (cue) openCue = cue;
    timeline.push({ kind: "line", line: lines.length });
    lines.push({
      index: row.index ?? lines.length,
      kind: chat ? "chat" : row.command === Command.telop ? "telop" : "dialogue",
      speakerId,
      speaker,
      textId: row.advTextID,
      text,
      voiceUrls,
      ...(runs ? { rich: runs } : {}),
      ...(videoId !== undefined ? { videoId } : {}),
      ...(cue ? { cue } : {}),
      ...(chat ? { chat } : {}),
    });
  }
  closeCue(Math.round(clipTime * 100) / 100);

  return {
    scriptName,
    locale,
    lines,
    timeline,
    backgrounds: [...backgrounds],
    stills: [...stills],
    bgmUrls: [...bgmUrls],
    seUrls: [...seUrls],
  };
}

export function normalizeStoryTable<T>(value: unknown): NormalizedTable<T> {
  const normalized = normalizeKeys(value);
  if (!isRecord(normalized) || !Array.isArray(normalized.allData)) {
    throw new Error("Invalid story table");
  }
  return {
    header: Array.isArray(normalized.header) ? normalized.header : [],
    allData: normalized.allData as T[],
  };
}

async function fetchStoryTable<T>(scriptName: string, table: StoryScriptTable, locale: StoryLocale, fetcher: typeof fetch): Promise<NormalizedTable<T>> {
  const url = getStoryScriptTableUrl(scriptName, table, locale);
  if (!url) throw new Error(`Story table is not in the release export: ${scriptName}-${table}`);
  let request = storyTableCache.tables.get(url);
  if (!request) {
    request = fetchReleaseJson<unknown>(url, fetcher).then((value) => normalizeStoryTable<unknown>(value));
    storyTableCache.tables.set(url, request);
  }
  return request as Promise<NormalizedTable<T>>;
}

function localizeText(row: TextRow, locale: StoryLocale): string {
  return localizeMasterText(row, locale).trim();
}

function collectSoundUrl(
  id: string | number | undefined,
  cueSheets: Map<string, SoundCueSheetRow>,
  resolver: (name: string) => string | undefined,
  destination: Set<string>,
): void {
  if (id === undefined || String(id) === "0") return;
  const name = cueSheets.get(String(id))?.cueSheetName;
  const url = name ? resolver(name) : undefined;
  if (url) destination.add(url);
}

function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key.replace(/^_/, ""), normalizeKeys(child)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

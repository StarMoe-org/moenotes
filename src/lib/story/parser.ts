import {
  getStoryBackgroundUrl,
  getStoryBgmUrl,
  getStoryScriptTableUrl,
  getStorySeUrl,
  getStoryStillUrl,
  getStoryVoiceUrl,
  type StoryScriptTable,
} from "@/lib/story/assets";
import { fetchReleaseJson } from "@/lib/assets/release";
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
  kind: "dialogue" | "narration";
  speakerId: string;
  speaker: string;
  textId: string;
  text: string;
  voiceUrls: string[];
  backgroundUrl: string | undefined;
  stillUrl: string | undefined;
}

export interface ParsedStoryScript {
  scriptName: string;
  locale: StoryLocale;
  lines: StoryLine[];
  backgrounds: string[];
  stills: string[];
  bgmUrls: string[];
  seUrls: string[];
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
  advTextID?: string;
  voiceIDs?: Array<string | number>;
  bgmID?: string | number;
  seID?: string | number;
}

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

export interface ParseStoryOptions {
  locale?: StoryLocale;
  fetcher?: typeof fetch;
}

export async function fetchAndParseStory(scriptName: string, options: ParseStoryOptions = {}): Promise<ParsedStoryScript> {
  const locale = options.locale ?? "ja-JP";
  const fetcher = options.fetcher ?? fetch;
  const [episode, text, sound, cueSheets] = await Promise.all([
    fetchStoryTable<EpisodeRow>(scriptName, "Episode", locale, fetcher),
    fetchStoryTable<TextRow>(scriptName, "Text", locale, fetcher),
    fetchStoryTable<SoundRow>(scriptName, "Sound", locale, fetcher),
    fetchStoryTable<SoundCueSheetRow>(scriptName, "SoundCueSheet", locale, fetcher),
  ]);

  return parseStoryTables(scriptName, { episode, text, sound, cueSheets }, locale);
}

export function parseStoryTables(
  scriptName: string,
  tables: {
    episode: NormalizedTable<EpisodeRow>;
    text: NormalizedTable<TextRow>;
    sound: NormalizedTable<SoundRow>;
    cueSheets: NormalizedTable<SoundCueSheetRow>;
  },
  locale: StoryLocale = "ja-JP",
): ParsedStoryScript {
  const texts = new Map(tables.text.allData.map((row) => [String(row.id ?? ""), row]));
  const sounds = new Map(tables.sound.allData.map((row) => [String(row.id ?? ""), row]));
  const cueSheets = new Map(tables.cueSheets.allData.map((row) => [String(row.id ?? ""), row]));
  const lines: StoryLine[] = [];
  const backgrounds = new Set<string>();
  const stills = new Set<string>();
  const bgmUrls = new Set<string>();
  const seUrls = new Set<string>();
  let backgroundUrl: string | undefined;
  let stillUrl: string | undefined;

  for (const row of tables.episode.allData) {
    if (row.command === 25 && row.targetAssetName) {
      backgroundUrl = getStoryBackgroundUrl(row.targetAssetName);
      if (backgroundUrl) backgrounds.add(backgroundUrl);
    } else if (row.command === 30 && row.targetAssetName) {
      stillUrl = getStoryStillUrl(row.targetAssetName);
      if (stillUrl) stills.add(stillUrl);
    }

    collectSoundUrl(row.bgmID, cueSheets, (name) => getStoryBgmUrl(name, locale), bgmUrls);
    collectSoundUrl(row.seID, cueSheets, (name) => getStorySeUrl(name, locale), seUrls);

    if ((row.command !== 2 && row.command !== 20) || !row.advTextID) continue;
    const textRow = texts.get(row.advTextID);
    const text = textRow ? localizeText(textRow, locale) : "";
    if (!text) continue;
    const speakerId = row.targetTextIDs?.[0] ?? row.targetName ?? "";
    const speakerRow = texts.get(speakerId);
    const speaker = speakerRow ? localizeText(speakerRow, locale) : row.targetName ?? "";
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

    lines.push({
      index: row.index ?? lines.length,
      kind: row.command === 20 ? "narration" : "dialogue",
      speakerId,
      speaker,
      textId: row.advTextID,
      text,
      voiceUrls,
      backgroundUrl,
      stillUrl,
    });
  }

  return {
    scriptName,
    locale,
    lines,
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

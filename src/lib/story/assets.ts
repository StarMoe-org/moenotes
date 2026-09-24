import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import storyTables from "@/lib/assets/generated/stories.json";
import { releaseFileUrl, selectReleaseId, type ReleaseEntry } from "@/lib/assets/release";
import { getAssetUrl } from "@/lib/assets/url";
import { loadReleaseAudio, type ReleaseAudio } from "./release-audio";

export type StoryScriptTable = "Episode" | "Sound" | "SoundCueSheet" | "Text" | "Video";

/** Published table file IDs by script name; only the story parser needs them, so they stay out of the image index. */
const stories: Readonly<Record<string, Readonly<Partial<Record<StoryScriptTable, ReleaseEntry>>>>> = storyTables;

/** Published JSON for a story table, or "" when the release index does not list it. */
export function getStoryScriptTableUrl(scriptName: string, table: StoryScriptTable, locale: AppLocale = DEFAULT_LOCALE): string {
  const cleanName = cleanSegment(scriptName);
  const id = Object.hasOwn(stories, cleanName) ? selectReleaseId(stories[cleanName]?.[table], locale) : undefined;
  return id ? releaseFileUrl(id) : "";
}

/** Loads the release audio of a story's cue sheets before its lines are resolved. */
export function loadStoryAudio(cueSheetNames: Iterable<string>, locale: AppLocale, fetcher?: typeof fetch): Promise<ReleaseAudio> {
  return loadReleaseAudio([...cueSheetNames].map(cleanSegment).filter(Boolean), locale, fetcher);
}

// Stage backgrounds and stills are not part of the release export yet; these resolve once the index lists them.
export function getStoryBackgroundUrl(targetAssetName: string): string | undefined {
  const assetName = lastAssetName(targetAssetName);
  if (!assetName) return undefined;
  return getAssetUrl({ path: `Adv/Stage/${assetName}/data/${assetName}.png` }) || undefined;
}

export function getStoryStillUrl(targetAssetName: string): string | undefined {
  const cleanPath = cleanAssetPath(targetAssetName);
  const assetName = lastAssetName(cleanPath);
  if (!cleanPath || !assetName) return undefined;
  const directory = cleanPath.split("/").slice(0, -1).join("/");
  return getAssetUrl({ path: `Adv/Still/${directory}/data/${assetName}.png` }) || undefined;
}

export function getStoryBgmUrl(audio: ReleaseAudio, cueSheetName: string): string | undefined {
  return audio.url(cleanSegment(cueSheetName));
}

export function getStorySeUrl(audio: ReleaseAudio, cueSheetName: string): string | undefined {
  return audio.url(cleanSegment(cueSheetName));
}

export interface StoryVoiceAsset {
  scriptName: string;
  cueName: string;
  cueSheetName: string;
  soundId: string | number;
}

/** Voice lines resolve by their exact cue sheet and cue name in the release audio index. */
export function getStoryVoiceUrl(audio: ReleaseAudio, asset: StoryVoiceAsset): string | undefined {
  const cueName = cleanSegment(asset.cueName);
  const cueSheetName = cleanSegment(asset.cueSheetName);
  if (!cueName || !cueSheetName) return undefined;
  return audio.url(cueSheetName, cueName);
}

function cleanSegment(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function cleanAssetPath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function lastAssetName(value: string): string {
  return cleanAssetPath(value).split("/").filter(Boolean).at(-1) ?? "";
}

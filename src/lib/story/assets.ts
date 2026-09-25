import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import { releaseFileUrl } from "@/lib/assets/release";
import { getAssetUrl } from "@/lib/assets/url";

export type StoryScriptTable = "Episode" | "Sound" | "SoundCueSheet" | "Text" | "Video";

/** Published JSON for a story table: `Adv/Episode/<script>/<script>-<table>/<script>-<table>.json`. */
export function getStoryScriptTableUrl(scriptName: string, table: StoryScriptTable, locale: AppLocale = DEFAULT_LOCALE): string {
  const cleanName = cleanSegment(scriptName);
  if (!cleanName) return "";
  const name = `${cleanName}-${table}`;
  return releaseFileUrl(`Adv/Episode/${cleanName}/${name}`, `${name}.json`, locale);
}

/** A CRI cue published as `Cri/Sound/<cue sheet>/<cue>.m4a`; the cue number is not adjusted. */
export function getCueUrl(cueSheetName: string, cueName: string, locale: AppLocale): string | undefined {
  const sheet = cleanSegment(cueSheetName);
  const cue = cleanSegment(cueName);
  return sheet && cue ? releaseFileUrl(`Cri/Sound/${sheet}`, `${cue}.m4a`, locale) : undefined;
}

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

/** A story clip, published as `Cri/Video/<asset>/<name>.mp4`; every language gets the same file. */
export function getStoryVideoUrl(assetName: string, locale: AppLocale): string | undefined {
  const cleanPath = cleanAssetPath(assetName);
  const name = lastAssetName(cleanPath);
  return cleanPath && name ? releaseFileUrl(`Cri/Video/${cleanPath}`, `${name}.mp4`, locale) : undefined;
}

/** Avatar a phone-chat message shows, by its MasterAdvChat icon asset. */
export function getStoryChatIconUrl(iconAssetName: string): string | undefined {
  const name = lastAssetName(iconAssetName);
  return name ? getAssetUrl({ path: `Adv/Chat/Icon/${name}.png` }) || undefined : undefined;
}

// BGM and SE sheets publish one cue named after the sheet.
export function getStoryBgmUrl(cueSheetName: string, locale: AppLocale): string | undefined {
  return getCueUrl(cueSheetName, cueSheetName, locale);
}

export function getStorySeUrl(cueSheetName: string, locale: AppLocale): string | undefined {
  return getCueUrl(cueSheetName, cueSheetName, locale);
}

export interface StoryVoiceAsset {
  scriptName: string;
  cueName: string;
  cueSheetName: string;
  soundId: string | number;
}

/** Voice lines resolve by their exact cue sheet and cue name. */
export function getStoryVoiceUrl(asset: StoryVoiceAsset, locale: AppLocale): string | undefined {
  return getCueUrl(asset.cueSheetName, asset.cueName, locale);
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

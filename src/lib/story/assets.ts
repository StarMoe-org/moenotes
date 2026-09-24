import { getAssetUrl } from "@/lib/assets/url";
import { getReleaseAudioUrl } from "./release-audio";

export type StoryScriptTable = "Episode" | "Sound" | "SoundCueSheet" | "Text" | "Video";

/** Published JSON for a story table, or "" when the release index does not list it. */
export function getStoryScriptTableUrl(scriptName: string, table: StoryScriptTable): string {
  const cleanName = cleanSegment(scriptName);
  return getAssetUrl({ path: `Adv/Episode/${cleanName}/${cleanName}-${table}.txt` });
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

export function getStoryBgmUrl(cueSheetName: string): string | undefined {
  return getReleaseAudioUrl(cleanSegment(cueSheetName));
}

export function getStorySeUrl(cueSheetName: string): string | undefined {
  return getReleaseAudioUrl(cleanSegment(cueSheetName));
}

export interface StoryVoiceAsset {
  scriptName: string;
  cueName: string;
  cueSheetName: string;
  soundId: string | number;
}

/** Voice lines resolve by their exact cue sheet and cue name in the release audio index. */
export function getStoryVoiceUrl(asset: StoryVoiceAsset): string | undefined {
  const cueName = cleanSegment(asset.cueName);
  const cueSheetName = cleanSegment(asset.cueSheetName);
  if (!cueName || !cueSheetName) return undefined;
  return getReleaseAudioUrl(cueSheetName, cueName);
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

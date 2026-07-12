import { getAssetUrl } from "@/lib/assets/url";

export type StoryScriptTable = "Episode" | "Sound" | "SoundCueSheet" | "Text" | "Video";

const CHARACTER_ID_BY_ASSET_NAME: Record<string, string> = {
  tomori: "001",
  anon: "002",
  rana: "003",
  soyo: "004",
  taki: "005",
  uika: "006",
  mutsumi: "007",
  umiri: "008",
  nyamu: "009",
  sakiko: "010",
};

export function getStoryScriptTableUrl(scriptName: string, table: StoryScriptTable): string {
  const cleanName = cleanSegment(scriptName);
  return getAssetUrl({ path: `Adv/Episode/${cleanName}/${cleanName}-${table}.txt` });
}

export function getStoryBackgroundUrl(targetAssetName: string): string | undefined {
  const assetName = lastAssetName(targetAssetName);
  if (!assetName) return undefined;
  return getAssetUrl({ path: `Adv/Stage/${assetName}/data/${assetName}.png` });
}

export function getStoryStillUrl(targetAssetName: string): string | undefined {
  const cleanPath = cleanAssetPath(targetAssetName);
  const assetName = lastAssetName(cleanPath);
  if (!cleanPath || !assetName) return undefined;
  const directory = cleanPath.split("/").slice(0, -1).join("/");
  return getAssetUrl({ path: `Adv/Still/${directory}/data/${assetName}.png` });
}

export function getStoryBgmUrl(cueSheetName: string): string | undefined {
  return getAdvSoundUrl("Bgm", cueSheetName);
}

export function getStorySeUrl(cueSheetName: string): string | undefined {
  return getAdvSoundUrl("Se", cueSheetName);
}

export interface StoryVoiceAsset {
  scriptName: string;
  cueName: string;
  cueSheetName: string;
  soundId: string | number;
}

function adjustVoiceCueName(cueName: string): string {
  const match = cueName.match(/^(.*)_(\d+)$/);
  if (!match) return cueName;
  const prefix = match[1];
  const digitsStr = match[2];
  if (!prefix || !digitsStr) return cueName;
  const val = parseInt(digitsStr, 10);
  if (isNaN(val)) return cueName;
  const newVal = Math.max(0, val - 1);
  const newDigitsStr = String(newVal).padStart(digitsStr.length, "0");
  return `${prefix}_${newDigitsStr}`;
}

/** Resolve decoded WAV locations produced by the Our Notes asset exporter. */
export function getStoryVoiceUrl(asset: StoryVoiceAsset): string | undefined {
  const cueName = cleanSegment(asset.cueName);
  const cueSheetName = cleanSegment(asset.cueSheetName);
  if (!cueName || !cueSheetName) return undefined;

  if (cueSheetName.startsWith("adv_voice_linkstory_")) {
    const names = cueSheetName
      .slice("adv_voice_linkstory_".length)
      .split("_")
      .filter((part) => part && !/^\d+$/.test(part));
    const pair = names.slice(0, 2).map((name) => CHARACTER_ID_BY_ASSET_NAME[name]);
    if (pair.length === 2 && pair.every(Boolean)) {
      const adjustedCueName = adjustVoiceCueName(cueName);
      return getAssetUrl({
        path: `Cri/Sound/Adv/Voice/Linkstory/${pair.join("_")}/${cueSheetName}/${adjustedCueName}.wav`,
      });
    }
  }

  if (cueSheetName.startsWith("adv_voice_")) {
    const storyGroup = cueSheetName.replace(/_\d{2}$/, "");
    const adjustedCueName = adjustVoiceCueName(cueName);
    return getAssetUrl({
      path: `Cri/Sound/Adv/Voice/Bandstory/${storyGroup}/${cueSheetName}/${adjustedCueName}.wav`,
    });
  }

  if (/^VoiceSystem_\d+$/i.test(cueSheetName)) {
    const index = getOneBasedSoundIndex(asset.soundId, 10_000);
    if (index === undefined) return undefined;
    return getAssetUrl({
      path: `Cri/Sound/Voice/${cueSheetName}/${cueSheetName}_${String(index).padStart(3, "0")}.wav`,
    });
  }

  if (cueSheetName.startsWith("home_")) {
    const bandName = cueSheetName.split("_")[2];
    const index = getOneBasedSoundIndex(asset.soundId, 100);
    if (!bandName || index === undefined) return undefined;
    return getAssetUrl({
      path: `Cri/Sound/Spot/${bandName}/${cueSheetName}/${cueSheetName}_${String(index).padStart(3, "0")}.wav`,
    });
  }

  return undefined;
}

function getAdvSoundUrl(kind: "Bgm" | "Se", cueSheetName: string): string | undefined {
  const cleanName = cleanSegment(cueSheetName);
  if (!cleanName) return undefined;
  return getAssetUrl({ path: `Cri/Sound/Adv/${kind}/${cleanName}.wav` });
}

function getOneBasedSoundIndex(soundId: string | number, modulus: number): number | undefined {
  try {
    const value = BigInt(soundId);
    const oneBased = Number(value % BigInt(modulus));
    return oneBased > 0 ? oneBased - 1 : undefined;
  } catch {
    return undefined;
  }
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

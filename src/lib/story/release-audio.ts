import { assetConfig } from "@/config/assets";
import audioFiles from "@/lib/assets/generated/audio.json";

const sheets: Readonly<Record<string, Readonly<Record<string, string>>>> = audioFiles;

export function resolveReleaseAudioPath(cueSheet: string, cueName?: string): string | undefined {
  const key = `Cri/Sound/${cueSheet}`;
  const cues = sheets[key];
  if (!cues) return undefined;
  const files = [...new Set(Object.values(cues))];
  const file = cueName ? cues[cueName] : cues[cueSheet] ?? (files.length === 1 ? files[0] : undefined);
  return file ? `${key}/${file}` : undefined;
}

export function getReleaseAudioUrl(cueSheet: string, cueName?: string): string | undefined {
  if (!assetConfig.releaseEnabled) return undefined;
  const path = resolveReleaseAudioPath(cueSheet, cueName);
  return path ? `${assetConfig.releaseSource}/${path}` : undefined;
}

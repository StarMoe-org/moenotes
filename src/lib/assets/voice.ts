import type { AppLocale } from "@/config/locales";
import { releaseFileUrl } from "./release";

/** Resolve a character voice's sound to a playable audio URL */
export function getVoiceAudioUrl(_soundId: number, _cueName: string, cueSheetName: string, locale: AppLocale): string {
  // Sound files are published as {cueSheetName}.m4a from the Cri/Sound directory.
  // The soundId/cueName fields are part of the public signature for future per-voice paths but unused today.
  return releaseFileUrl(`Cri/Sound/${cueSheetName}`, `${cueSheetName}.m4a`, locale);
}

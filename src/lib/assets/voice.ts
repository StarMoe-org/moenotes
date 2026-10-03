import type { AppLocale } from "@/config/locales";
import { releaseFileUrl } from "./release";

/**
 * A voice line's audio file: `Cri/Sound/<cue sheet>/<cue>.m4a`, named by the exact cue (docs/release-assets.md, Audio).
 * Only BGM/SE sheets publish one cue named after the sheet; voice sheets hold many cues, so the sheet name alone 404s.
 */
export function getVoiceAudioUrl(_soundId: number, cueName: string, cueSheetName: string, locale: AppLocale): string {
  return releaseFileUrl(`Cri/Sound/${cueSheetName}`, `${cueName}.m4a`, locale);
}

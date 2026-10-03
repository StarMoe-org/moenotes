import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { getVoiceAudioUrl } from "@/lib/assets/voice";
import { memo, table } from "@/lib/masterdata/build-core";

/**
 * A server's voice files by MasterSound id: soundId → MasterSound (cueName, soundCueSheetID) →
 * MasterSoundCueSheet.cueSheetName → `Cri/Sound/<sheet>/<cue>.m4a` (getVoiceAudioUrl). "" when the sound is unknown.
 */
export function soundUrlResolverOn(server: GameServer, locale: AppLocale): Promise<(soundId: number) => string> {
  return memo(`sound-urls:${server}:${locale}`, async () => {
    const [sounds, sheets] = await Promise.all([
      table<{ id: number; cueName: string; soundCueSheetID: number }>("MasterSound.json", server).catch(() => ({ _allData: [] })),
      table<{ id: number; cueSheetName: string }>("MasterSoundCueSheet.json", server).catch(() => ({ _allData: [] })),
    ]);
    const sheetNames = new Map(sheets._allData.map((sheet) => [sheet.id, sheet.cueSheetName]));
    const soundMap = new Map(sounds._allData.map((sound) => [sound.id, sound]));
    return (soundId: number) => {
      const sound = soundMap.get(soundId);
      const sheet = sound ? sheetNames.get(sound.soundCueSheetID) : undefined;
      return sound?.cueName && sheet ? getVoiceAudioUrl(soundId, sound.cueName, sheet, locale) : "";
    };
  });
}

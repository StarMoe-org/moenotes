import { assetConfig } from "@/config/assets";
import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import type { AssetRequest } from "@/types/assets";
import { releaseFileUrl } from "./release";

const EXTENSION_BY_TYPE = {
  image: ".png",
  audio: "",
  json: ".json",
  raw: "",
} as const;

const AUDIO_PREFIX = "Cri/Sound/";

/**
 * Release URL for a logical asset path from MasterData.
 *
 * - image: a PNG path published as `<key>/<name>.webp`; member-card `_atlas` paths name the original full image, not a
 *   face/formation crop. Non-PNG image paths have no published form and answer "".
 * - audio: the path names or contains a CRI cue sheet, published as `{language}/Cri/Sound/<sheet>/<sheet>.m4a`.
 * - json: the path is published as-is (chart data, config files).
 */
export function getAssetUrl(request: AssetRequest): string {
  const locale = request.locale ?? DEFAULT_LOCALE;
  switch (request.type) {
    case "audio":
      return getAudioAssetUrl(request.path, locale);
    case "json": {
      const path = request.path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      return path ? `${assetConfig.api}/${path}${EXTENSION_BY_TYPE.json}` : "";
    }
    default: {
      const path = `${request.path.replace(/^\/+/, "")}${request.type === "image" ? EXTENSION_BY_TYPE.image : ""}`;
      if (!path.endsWith(".png")) return "";
      const key = path.slice(0, -4).replace(/^(MemberCard\/\d+\/[^/]+)_atlas$/, "$1");
      return releaseFileUrl(key, `${key.split("/").at(-1)}.webp`, locale);
    }
  }
}

/**
 * Audio lives on the CRIWARE ACB/AWB system and is published as CRI cues: a cue-sheet name becomes
 * `Cri/Sound/<sheet>/<sheet>.m4a`. Sheets are addressed plain (`A_AveMujica`), under the sound root
 * (`Cri/Sound/MusicScore/A_AveMujica`) or by the source file's `.acb`/`.awb`/`.m4a` path — every form names the
 * same exported file.
 */
export function getAudioAssetUrl(cueSheetPath: string, locale: AppLocale = DEFAULT_LOCALE): string {
  const cleanPath = cueSheetPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.(acb|awb|m4a)$/i, "");
  if (!cleanPath) return "";
  const key = cleanPath.startsWith(AUDIO_PREFIX) ? cleanPath : `${AUDIO_PREFIX}${cleanPath}`;
  const sheet = key.split("/").filter(Boolean).at(-1);
  return sheet ? releaseFileUrl(key, `${sheet}.m4a`, locale) : "";
}

/** Artwork addressed by its MasterData asset path; the extension is optional. Text-bearing art differs by language. */
export function getImageAssetUrl(path: string, locale: AppLocale): string {
  if (!path) return "";
  return getAssetUrl({ path: path.endsWith(".png") ? path : `${path}.png`, locale });
}

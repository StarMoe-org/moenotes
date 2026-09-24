import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import type { AssetRequest } from "@/types/assets";
import { releaseFileUrl } from "./release";

const EXTENSION_BY_TYPE = {
  image: ".webp",
  audio: ".mp3",
  json: ".json",
  raw: "",
} as const;

/**
 * Release URL for a logical PNG path from MasterData; the service publishes it as `<key>/<name>.webp`.
 * Member-card `_atlas` paths name the original full image, not a face/formation crop.
 */
export function getAssetUrl(request: AssetRequest): string {
  const path = `${request.path.replace(/^\/+/, "")}${EXTENSION_BY_TYPE[request.type ?? "raw"]}`;
  if (!path.endsWith(".png")) return "";
  const key = path.slice(0, -4).replace(/^(MemberCard\/\d+\/[^/]+)_atlas$/, "$1");
  return releaseFileUrl(key, `${key.split("/").at(-1)}.webp`, request.locale ?? DEFAULT_LOCALE);
}

/** Artwork addressed by its MasterData asset path; the extension is optional. Text-bearing art differs by language. */
export function getImageAssetUrl(path: string, locale: AppLocale): string {
  if (!path) return "";
  return getAssetUrl({ path: path.endsWith(".png") ? path : `${path}.png`, locale });
}

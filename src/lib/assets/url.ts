import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import type { AssetRequest } from "@/types/assets";
import { releaseFileUrl } from "./release";
import { resolveReleaseAssetId } from "./release-path";

const EXTENSION_BY_TYPE = {
  image: ".webp",
  audio: ".mp3",
  json: ".json",
  raw: "",
} as const;

/**
 * Release file URL for a logical asset path, or "" when the release index does not list it.
 * The asset service serves files only by ID, so unlisted paths are never guessed.
 */
export function getAssetUrl(request: AssetRequest): string {
  const path = `${request.path.replace(/^\/+/, "")}${EXTENSION_BY_TYPE[request.type ?? "raw"]}`;
  const id = resolveReleaseAssetId(path, request.locale ?? DEFAULT_LOCALE);
  return id ? releaseFileUrl(id) : "";
}

/** Artwork addressed by its MasterData asset path; the extension is optional. Text-bearing art differs by language. */
export function getImageAssetUrl(path: string, locale: AppLocale): string {
  if (!path) return "";
  return getAssetUrl({ path: path.endsWith(".png") ? path : `${path}.png`, locale });
}

export { getAssetFileName } from "./release-path";

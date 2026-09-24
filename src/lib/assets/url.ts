import { assetConfig } from "@/config/assets";
import type { AssetRequest } from "@/types/assets";
import { resolveReleaseAssetPath } from "./release-path";

const EXTENSION_BY_TYPE = {
  image: ".webp",
  audio: ".mp3",
  json: ".json",
  raw: "",
} as const;

/**
 * Release-bucket URL for a logical asset path, or "" when the release index does not list it.
 * Unlisted paths are not guessed: object names carry export sequence numbers that vary per asset.
 */
export function getAssetUrl(request: AssetRequest): string {
  const path = `${request.path.replace(/^\/+/, "")}${EXTENSION_BY_TYPE[request.type ?? "raw"]}`;
  const releasePath = resolveReleaseAssetPath(path);
  return releasePath ? `${assetConfig.releaseSource}/${releasePath}` : "";
}

/** PNG artwork addressed by its MasterData asset path; the extension is optional. */
export function getImageAssetUrl(path: string): string {
  if (!path) return "";
  return getAssetUrl({ path: path.endsWith(".png") ? path : `${path}.png` });
}

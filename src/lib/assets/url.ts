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
 * The preferred asset source. Always "main" — source selection is no longer a
 * user-facing setting; the fallback chain still provides resilience.
 */
const PREFERRED_ASSET_SOURCE = "main" as const;

export function getAssetUrl(request: AssetRequest): string {
  const source = getPreferredAssetSource(request);
  const type = request.type ?? "raw";
  const cleanPath = request.path.replace(/^\/+/, "");
  const path = `${cleanPath}${EXTENSION_BY_TYPE[type]}`;
  const releasePath = source === "main" && assetConfig.releaseEnabled ? resolveReleaseAssetPath(path) : undefined;
  return releasePath ? `${assetConfig.releaseSource}/${releasePath}` : `${assetConfig.sources[source]}/${path}`;
}

/** PNG artwork addressed by its MasterData asset path; the extension is optional. */
export function getImageAssetUrl(path: string): string {
  if (!path) return "";
  return getAssetUrl({ path: path.endsWith(".png") ? path : `${path}.png` });
}

export function getAssetFallbackUrls(request: AssetRequest): string[] {
  const urls = getAssetSourceFallbackOrder(getPreferredAssetSource(request))
    .map((source) => getAssetUrl({ ...request, source }));
  const legacy = `${assetConfig.sources.main}/${request.path.replace(/^\/+/, "")}${EXTENSION_BY_TYPE[request.type ?? "raw"]}`;
  if (!urls.includes(legacy)) urls.splice(getPreferredAssetSource(request) === "main" ? 1 : 2, 0, legacy);
  return urls.filter((url, index, all) => all.indexOf(url) === index);
}

function getPreferredAssetSource(request: AssetRequest): "main" | "backup" {
  return request.source ?? PREFERRED_ASSET_SOURCE;
}

function getAssetSourceFallbackOrder(source: "main" | "backup"): Array<"main" | "backup"> {
  return source === "main" ? ["main", "backup"] : ["backup", "main"];
}

import { assetConfig } from "@/config/assets";
import type { AssetRequest } from "@/types/assets";

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
  return `${assetConfig.sources[source]}/${cleanPath}${EXTENSION_BY_TYPE[type]}`;
}

export function getAssetFallbackUrls(request: AssetRequest): string[] {
  return getAssetSourceFallbackOrder(getPreferredAssetSource(request))
    .map((source) => getAssetUrl({ ...request, source }))
    .filter((url, index, all) => all.indexOf(url) === index);
}

function getPreferredAssetSource(request: AssetRequest): "main" | "backup" {
  return request.source ?? PREFERRED_ASSET_SOURCE;
}

function getAssetSourceFallbackOrder(source: "main" | "backup"): Array<"main" | "backup"> {
  return source === "main" ? ["main", "backup"] : ["backup", "main"];
}

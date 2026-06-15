import { assetConfig } from "@/config/assets";
import { getSettings } from "@/lib/settings/store";
import type { AssetRequest } from "@/types/assets";
import type { AssetSource } from "@/types/settings";

const EXTENSION_BY_TYPE = {
  image: ".webp",
  audio: ".mp3",
  json: ".json",
  raw: "",
} as const;

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

function getPreferredAssetSource(request: AssetRequest): AssetSource {
  return request.source ?? getSettings().assetSource;
}

function getAssetSourceFallbackOrder(source: AssetSource): AssetSource[] {
  return source === "main" ? ["main", "backup"] : ["backup", "main"];
}

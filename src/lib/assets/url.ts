import { assetConfig } from "@/config/assets";
import type { AssetRequest } from "@/types/assets";

const EXTENSION_BY_TYPE = {
  image: ".webp",
  audio: ".mp3",
  json: ".json",
  raw: "",
} as const;

export function getAssetUrl(request: AssetRequest): string {
  const source = request.source ?? "main";
  const type = request.type ?? "raw";
  const cleanPath = request.path.replace(/^\/+/, "");
  return `${assetConfig.sources[source]}/${cleanPath}${EXTENSION_BY_TYPE[type]}`;
}

export function getAssetFallbackUrls(request: AssetRequest): string[] {
  return [getAssetUrl({ ...request, source: request.source ?? "main" }), getAssetUrl({ ...request, source: "backup" })]
    .filter((url, index, all) => all.indexOf(url) === index);
}

import type { AssetRequest } from "@/types/assets";
import { cachedFetch, type CachedFetchInit } from "@/lib/cache/cached-fetch";
import { getAssetFallbackUrls } from "@/lib/assets/url";

export interface CachedAssetObjectUrl {
  url: string;
  contentType: string;
  revoke: () => void;
}

export async function fetchCachedAsset(request: AssetRequest, init?: CachedFetchInit): Promise<Response> {
  const urls = getAssetFallbackUrls(request);
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const response = await cachedFetch(url, init);
      if (response.ok) return response;
      lastError = new Error(`Asset request failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Asset request failed.");
}

export async function createCachedAssetObjectUrl(request: AssetRequest, init?: CachedFetchInit): Promise<CachedAssetObjectUrl> {
  const response = await fetchCachedAsset(request, init);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  return {
    url: objectUrl,
    contentType: response.headers.get("content-type") ?? blob.type,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

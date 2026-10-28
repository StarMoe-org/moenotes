import type { NextRequest } from "next/server";
import {
  currentMasterDataEpochSync,
  forceRefreshMasterData,
  getBuildManifest,
  shouldBypassMasterDataCache,
} from "@/lib/masterdata/build-snapshot";
import { buildContentSearchIndex } from "@/lib/search/content-index";

export const dynamic = "force-dynamic";

let cachedEpoch = -1;
let cachedVersion = "";
let cachedJson = "";

export async function GET(request: NextRequest) {
  const forceBypass = shouldBypassMasterDataCache({
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  });
  const manifest = forceBypass
    ? await forceRefreshMasterData({ purgeTables: true })
    : await getBuildManifest();
  const epoch = currentMasterDataEpochSync();
  if (forceBypass || cachedEpoch !== epoch || cachedVersion !== manifest.dataVersion || !cachedJson) {
    const entries = await buildContentSearchIndex();
    cachedEpoch = currentMasterDataEpochSync();
    cachedVersion = manifest.dataVersion;
    cachedJson = JSON.stringify({ dataVersion: manifest.dataVersion, entries });
  }
  const requestedV = request.nextUrl.searchParams.get("v");
  const cacheControl = forceBypass
    ? "no-store"
    : requestedV && requestedV === manifest.dataVersion
      ? "public, max-age=3600, stale-while-revalidate=86400"
      : "public, max-age=120, stale-while-revalidate=600";
  return new Response(cachedJson, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Moenotes-Data-Version": manifest.dataVersion,
      "Cache-Control": cacheControl,
    },
  });
}

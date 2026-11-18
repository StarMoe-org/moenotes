import type { NextRequest } from "next/server";
import { getBuildBandItemUpgrades } from "@/lib/masterdata/build-data";
import {
  currentMasterDataEpochSync,
  getBuildManifest,
  isMasterDataPurgeAuthorized,
  resolveBypassMasterDataManifest,
  shouldBypassMasterDataCache,
} from "@/lib/masterdata/build-snapshot";

export const dynamic = "force-dynamic";

let cachedEpoch = -1;
let cachedVersion = "";
let cachedJson = "";
let inFlightEpoch = -1;
let inFlightVersion = "";
let inFlightBuild: Promise<string> | null = null;

async function buildCachedBandItemUpgradesJson(epoch: number, version: string, forceRebuild: boolean): Promise<string> {
  if (!forceRebuild && cachedEpoch === epoch && cachedVersion === version && cachedJson) {
    return cachedJson;
  }
  if (!forceRebuild && inFlightBuild && inFlightEpoch === epoch && inFlightVersion === version) {
    return inFlightBuild;
  }
  const current = (async () => {
    const data = await getBuildBandItemUpgrades();
    const builtEpoch = currentMasterDataEpochSync();
    const json = JSON.stringify(data);
    if (builtEpoch === currentMasterDataEpochSync()) {
      cachedEpoch = builtEpoch;
      cachedVersion = version;
      cachedJson = json;
    }
    return json;
  })().finally(() => {
    if (inFlightBuild === current) {
      inFlightBuild = null;
    }
  });
  inFlightEpoch = epoch;
  inFlightVersion = version;
  inFlightBuild = current;
  return current;
}

export async function GET(request: NextRequest) {
  const requestedBypass = shouldBypassMasterDataCache({
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  });
  const authorizedBypass = requestedBypass && isMasterDataPurgeAuthorized(request.headers);
  const manifest = requestedBypass
    ? await resolveBypassMasterDataManifest(request.headers)
    : await getBuildManifest();
  const epoch = currentMasterDataEpochSync();
  const json = await buildCachedBandItemUpgradesJson(epoch, manifest.dataVersion, authorizedBypass);
  const requestedV = request.nextUrl.searchParams.get("v");
  const cacheControl = authorizedBypass
    ? "no-store"
    : requestedV && requestedV === manifest.dataVersion
      ? "public, max-age=3600, stale-while-revalidate=86400"
      : "public, max-age=120, stale-while-revalidate=600";
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Moenotes-Data-Version": manifest.dataVersion,
      "Cache-Control": cacheControl,
    },
  });
}

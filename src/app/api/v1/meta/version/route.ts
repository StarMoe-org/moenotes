import type { NextRequest } from "next/server";
import { buildEnv } from "@/config/build-env";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import {
  forceRefreshMasterData,
  getBuildManifest,
  getMasterDataCacheStats,
  shouldBypassMasterDataCache,
} from "@/lib/masterdata/build-snapshot";

export const dynamic = "force-dynamic";

function isPurgeAuthorized(request: NextRequest): boolean {
  const expected = buildEnv("MOENOTES_CACHE_PURGE_TOKEN")?.trim();
  if (!expected) return true;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerToken = request.headers.get("x-moenotes-purge-token")?.trim() ?? "";
  return bearer === expected || headerToken === expected;
}

async function handleVersionRequest(request: NextRequest, forceByMethod: boolean) {
  const forceBypass =
    forceByMethod ||
    shouldBypassMasterDataCache({
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
    });

  if (forceBypass && !isPurgeAuthorized(request)) {
    return Response.json(
      { error: "Unauthorized cache purge token" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const previousDataVersion = getMasterDataCacheStats().dataVersion;
  const manifest = forceBypass
    ? await forceRefreshMasterData({ purgeTables: true })
    : await getBuildManifest();
  const servers = await getBuildServers(forceBypass ? { reloadOnly: true } : undefined);
  const stats = getMasterDataCacheStats();

  return Response.json(
    {
      dataVersion: manifest.dataVersion || "unknown",
      previousDataVersion,
      refreshed: forceBypass,
      generatedAt: manifest.generatedAt || null,
      regions: manifest.regions ?? {},
      servers,
      cache: stats,
      markdown: {
        enabled: true,
        negotiationHeader: "Accept: text/markdown",
        extension: ".md",
        llmsTxt: "/llms.txt",
        llmsFullTxt: "/llms-full.txt",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        Pragma: "no-cache",
        ...(forceBypass ? { "X-Moenotes-Cache-Bypass": "1" } : {}),
      },
    },
  );
}

export async function GET(request: NextRequest) {
  return handleVersionRequest(request, false);
}

export async function POST(request: NextRequest) {
  return handleVersionRequest(request, true);
}

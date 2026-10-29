import type { NextRequest } from "next/server";
import { buildEnv } from "@/config/build-env";
import { isGameServer, PRIMARY_SERVER } from "@/config/servers";
import { forceRefreshMasterData, shouldBypassMasterDataCache } from "@/lib/masterdata/build-snapshot";
import { getDeckMasterOverlay } from "@/lib/masterdata/deck-master";

export const dynamic = "force-dynamic";

function isPurgeAuthorized(request: NextRequest): boolean {
  const expected = buildEnv("MOENOTES_CACHE_PURGE_TOKEN")?.trim();
  if (!expected) return true;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerToken = request.headers.get("x-moenotes-purge-token")?.trim() ?? "";
  return bearer === expected || headerToken === expected;
}

export async function GET(request: NextRequest) {
  const rawServer = request.nextUrl.searchParams.get("server")?.trim();
  if (rawServer && !isGameServer(rawServer)) {
    return Response.json(
      { error: "Invalid game server" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const server = rawServer && isGameServer(rawServer) ? rawServer : PRIMARY_SERVER;

  const requestedBypass = shouldBypassMasterDataCache({
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  });
  const forceBypass = requestedBypass && isPurgeAuthorized(request);
  if (forceBypass) {
    await forceRefreshMasterData({ purgeTables: true });
  }

  const payload = await getDeckMasterOverlay(server, forceBypass ? { forceBypass: true } : undefined);
  const versionParam = request.nextUrl.searchParams.get("v")?.trim();
  const cacheControl = !forceBypass && versionParam
    ? "private, max-age=60, stale-while-revalidate=300"
    : "no-store, no-cache, max-age=0, must-revalidate";

  return Response.json(payload, {
    headers: {
      "Cache-Control": cacheControl,
      ...(forceBypass ? { "X-Moenotes-Cache-Bypass": "1" } : {}),
    },
  });
}

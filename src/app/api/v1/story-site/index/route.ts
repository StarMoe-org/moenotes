import type { NextRequest } from "next/server";
import {
  getReleasedStorySiteIndex,
  isStorySiteRegion,
  toPublicStoryIndexEntry,
} from "@/lib/story/site-access";

export const dynamic = "force-dynamic";

/**
 * A cloud listing is only a locator, never release evidence. Return a small, sanitized list only after the same-region
 * MasterData confirms each story's official in-game release time.
 */
export async function GET(request: NextRequest) {
  const server = request.nextUrl.searchParams.get("server") ?? "";
  if (!isStorySiteRegion(server)) {
    return Response.json({ error: "Unsupported story site" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { stories } = await getReleasedStorySiteIndex(server);
    return Response.json({ stories: stories.map(toPublicStoryIndexEntry) }, {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
        "X-Moenotes-Story-Region": server,
      },
    });
  } catch (error) {
    console.error("[story-player] failed to verify the regional story index:", error);
    return Response.json({ error: "Story index is temporarily unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

import type { NextRequest } from "next/server";
import { isGameServer } from "@/config/servers";
import { getReleasedLive2DModels } from "@/lib/live2d/site-access";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * A cloud model index is only a locator. Equippable costumes are listed only once regional MasterData releases them;
 * story-only outfits have no MasterData record to date and stay listed.
 */
export async function GET(request: NextRequest) {
  const server = request.nextUrl.searchParams.get("server") ?? "";
  if (!isGameServer(server)) {
    return Response.json({ error: "Invalid game server" }, { status: 400, headers: NO_STORE });
  }
  try {
    const models = await getReleasedLive2DModels(server);
    return Response.json({ models }, { headers: { ...NO_STORE, "X-Moenotes-Live2D-Region": server } });
  } catch (error) {
    console.error("[live2d] failed to verify the regional model index:", error);
    return Response.json({ error: "Model index is temporarily unavailable" }, { status: 502, headers: NO_STORE });
  }
}

import { currentMasterDataEpochSync } from "@/lib/masterdata/build-snapshot";
import { buildContentSearchIndex } from "@/lib/search/content-index";

export const dynamic = "force-dynamic";

let cachedEpoch = -1;
let cachedJson = "";

export async function GET() {
  const epoch = currentMasterDataEpochSync();
  if (cachedEpoch !== epoch || !cachedJson) {
    const entries = await buildContentSearchIndex();
    cachedEpoch = currentMasterDataEpochSync();
    cachedJson = JSON.stringify({ entries });
  }
  return new Response(cachedJson, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
    },
  });
}

import { getBuildBandItemUpgrades } from "@/lib/masterdata/build-data";
import { currentMasterDataEpochSync } from "@/lib/masterdata/build-snapshot";

export const dynamic = "force-dynamic";

let cachedEpoch = -1;
let cachedJson = "";

export async function GET() {
  const epoch = currentMasterDataEpochSync();
  if (cachedEpoch !== epoch || !cachedJson) {
    const data = await getBuildBandItemUpgrades();
    cachedEpoch = currentMasterDataEpochSync();
    cachedJson = JSON.stringify(data);
  }
  return new Response(cachedJson, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
    },
  });
}

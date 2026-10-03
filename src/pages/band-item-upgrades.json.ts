import { getBuildBandItemUpgrades } from "@/lib/masterdata/build-data";

/**
 * `/band-item-upgrades.json`: every band item's per-level upgrade materials as one static file, built with the pages
 * from the same MasterData. The band-items page fetches it when a detail overlay first opens, so the list itself
 * carries none of it; one download serves every locale since material names carry all five language cells.
 */
export async function GET() {
  return new Response(JSON.stringify(await getBuildBandItemUpgrades()), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

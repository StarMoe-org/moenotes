import { getBuildCharacterVoices } from "@/lib/masterdata/build-character-voices";

/**
 * `/character-voices.json`: every character's voice lines (eight MasterData sources) per server, as one static file
 * built with the pages. The character page fetches it when its voice section first opens, so the page itself carries
 * none of it; one download serves every locale since texts carry all five language cells.
 */
export async function GET() {
  return new Response(JSON.stringify(await getBuildCharacterVoices()), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

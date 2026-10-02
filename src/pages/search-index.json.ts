import { buildContentSearchIndex } from "@/lib/search/content-index";

/**
 * `/search-index.json`: the content search index as a single static file, built alongside the pages from the same
 * MasterData. The browser fetches it once on first search (and revalidates by ETag afterwards); matching stays fully
 * client-side, one download serving every locale since titles carry all five language cells.
 */
export async function GET() {
  const entries = await buildContentSearchIndex();
  return new Response(JSON.stringify({ entries }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

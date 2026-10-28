import { renderLlmsTxt } from "@/lib/markdown/render";

export const dynamic = "force-dynamic";

export async function GET() {
  const { body, dataVersion } = await renderLlmsTxt(true);
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Moenotes-Data-Version": dataVersion,
      "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
    },
  });
}

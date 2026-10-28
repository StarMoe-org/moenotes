import type { NextRequest } from "next/server";
import { renderMarkdownForPath } from "@/lib/markdown/render";
import { forceRefreshMasterData, shouldBypassMasterDataCache } from "@/lib/masterdata/build-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const forceBypass = shouldBypassMasterDataCache({
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  });
  if (forceBypass) {
    await forceRefreshMasterData({ purgeTables: true }).catch(() => {});
  }

  const path =
    request.nextUrl.searchParams.get("path") ||
    request.headers.get("x-moenotes-markdown-path") ||
    (request.nextUrl.pathname !== "/api/v1/markdown" ? request.nextUrl.pathname : "/");
  const doc = await renderMarkdownForPath(path);
  if (!doc) {
    return new Response("# 404 Not Found\n\nThe requested Markdown document does not exist.\n", {
      status: 404,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
        Vary: "Accept",
      },
    });
  }

  return new Response(doc.markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Markdown-Tokens": String(doc.tokens),
      "X-Moenotes-Data-Version": doc.dataVersion,
      ...(forceBypass ? { "X-Moenotes-Cache-Bypass": "1" } : {}),
      Link: `<${doc.canonicalUrl}>; rel="canonical"`,
      "Cache-Control": forceBypass ? "no-store" : "public, max-age=60, stale-while-revalidate=600",
      Vary: "Accept",
    },
  });
}

import { sitemapShardLocales } from "@/lib/seo/sitemap";
import { absolutePageUrl } from "@/lib/seo/metadata";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Sitemap index. The previous single-file sitemap grew large (13 locales × every route), so it is split into
 * one shard per locale at /sitemaps/<locale-code>.xml (e.g. /sitemaps/zh-CN.xml, /sitemaps/ja-JP.xml). The
 * index lists exactly the shards this build rendered: a core-locale build advertises only the core shards.
 * (Astro 7 empties outDir per build and each build batch renders its own shard set, so crawler-visible sitemap
 * content follows the build's active locale set.)
 */
export async function GET() {
  const shards = sitemapShardLocales().map((locale) => `  <sitemap>
    <loc>${escapeXml(absolutePageUrl(`/sitemaps/${locale}.xml`))}</loc>
  </sitemap>`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${shards.join("\n")}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

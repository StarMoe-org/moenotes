import { absolutePageUrl } from "@/lib/seo/metadata";
import { sitemapShardLocales } from "@/lib/seo/sitemap";

export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const shards = sitemapShardLocales().map(
    (locale) => `  <sitemap>
    <loc>${escapeXml(absolutePageUrl(`/sitemaps/${locale}.xml`))}</loc>
  </sitemap>`,
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${shards.join("\n")}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}

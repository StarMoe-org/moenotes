import { SUPPORTED_LOCALES } from "@/config/locales";
import { getStaticSitemapEntries } from "@/lib/seo/sitemap";

export function GET() {
  const entries = SUPPORTED_LOCALES.flatMap((locale) => getStaticSitemapEntries(locale));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => `  <url>
    <loc>${entry.loc}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

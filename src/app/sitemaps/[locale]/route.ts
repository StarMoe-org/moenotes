import { isAppLocale } from "@/config/locales";
import { siteConfig } from "@/config/site";
import { getSitemapEntries, type SitemapEntry } from "@/lib/seo/sitemap";

export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(_request: Request, context: { params: Promise<{ locale: string }> }) {
  const { locale: rawParam } = await context.params;
  const locale = rawParam.endsWith(".xml") ? rawParam.slice(0, -4) : rawParam;
  if (!isAppLocale(locale)) {
    return new Response("Not found\n", { status: 404 });
  }

  const all = await getSitemapEntries();
  const entries = all.filter((entry) => entry.locale === locale);
  const xml = renderUrlset(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}

function renderUrlset(entries: SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="${siteConfig.xmlNamespaces.xhtml}">
${entries
  .map((entry) => {
    const urlParts = [`    <loc>${escapeXml(entry.loc)}</loc>`];
    if (entry.lastmod) {
      urlParts.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    }
    urlParts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    urlParts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);

    for (const alternate of entry.alternates) {
      urlParts.push(
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.locale)}" href="${escapeXml(alternate.href)}" />`,
      );
    }
    urlParts.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(entry.xDefault)}" />`);

    return `  <url>\n${urlParts.join("\n")}\n  </url>`;
  })
  .join("\n")}
</urlset>`;
}

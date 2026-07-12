import { siteConfig } from "@/config/site";
import { getSitemapEntries } from "@/lib/seo/sitemap";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const entries = await getSitemapEntries();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="${siteConfig.xmlNamespaces.xhtml}">
${entries.map((entry) => {
  const urlParts = [
    `    <loc>${escapeXml(entry.loc)}</loc>`,
  ];
  if (entry.lastmod) {
    urlParts.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
  }
  urlParts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
  urlParts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
  
  entry.alternates.forEach((alternate) => {
    urlParts.push(`    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.locale)}" href="${escapeXml(alternate.href)}" />`);
  });
  urlParts.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(entry.xDefault)}" />`);

  return `  <url>\n${urlParts.join("\n")}\n  </url>`;
}).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

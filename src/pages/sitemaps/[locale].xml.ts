import { isAppLocale } from "@/config/locales";
import { getSitemapEntries, type SitemapEntry } from "@/lib/seo/sitemap";
import { siteConfig } from "@/config/site";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Per-locale sitemap shard (`/sitemaps/<locale-code>.xml`, e.g. `/sitemaps/ja-JP.xml`). One shard per locale
 * this build actively renders (`MOENOTES_BUILD_LOCALES`). A shard for any other locale has no static path here,
 * so Astro serves 404 — the correct signal for "not in this release yet" (the sitemap index advertises only
 * shards this build emitted). hreflang alternates inside each shard point across the build's full active set.
 */
export async function getStaticPaths() {
  const all = await getSitemapEntries();
  const locales = [...new Set(all.map((entry) => entry.locale))];
  return locales.map((locale) => ({ params: { locale }, props: { locale } }));
}

export async function GET({ params }: { params: { locale: string } }) {
  if (!isAppLocale(params.locale)) return new Response("Not found\n", { status: 404 });
  const locale = params.locale;

  const all = await getSitemapEntries();
  const entries = all.filter((entry) => entry.locale === locale);
  const xml = renderUrlset(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

function renderUrlset(entries: SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
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
}

import { SUPPORTED_LOCALES } from "../src/config/locales";
import { t } from "../src/i18n";
import { getAllRoutes, getAllStaticRoutes, isDynamicRoute } from "../src/lib/route/registry";
import { buildStaticSearchIndex } from "../src/lib/search/static-index";
import { getSitemapEntries } from "../src/lib/seo/sitemap";

const errors: string[] = [];

const searchItems = buildStaticSearchIndex();
const searchIds = new Set(searchItems.map((item) => item.id));
const expectedSearchRoutes = getAllStaticRoutes().filter((route) => route.searchable);
const indexableStaticRoutes = getAllStaticRoutes().filter((route) => route.seo.indexable !== false);

for (const route of expectedSearchRoutes) {
  if (!searchIds.has(route.id)) errors.push(`Search index is missing route: ${route.id}`);
}

const dynamicRouteIds = new Set(getAllRoutes().filter(isDynamicRoute).map((route) => route.id));
for (const item of searchItems) {
  if (dynamicRouteIds.has(item.id)) errors.push(`Dynamic route leaked into search index: ${item.id}`);
}

if (!searchIds.has("home")) errors.push("Search index must include the home route.");
if (searchItems.length !== searchIds.size) errors.push("Search index contains duplicate route ids.");

for (const route of indexableStaticRoutes) {
  const keywords = route.seo.keywords ?? [];
  if (keywords.length < 4) errors.push(`Indexable route needs at least four SEO keywords: ${route.id}`);
  if (new Set(keywords.map((keyword) => keyword.toLocaleLowerCase())).size !== keywords.length) {
    errors.push(`Indexable route has duplicate SEO keywords: ${route.id}`);
  }
  for (const locale of SUPPORTED_LOCALES) {
    const title = t(locale, route.seo.titleKey).trim();
    const description = t(locale, route.seo.descriptionKey).trim();
    if (title.length < 4) errors.push(`SEO title is too short for ${route.id} (${locale}).`);
    if (description.length < 40) errors.push(`SEO description is too short for ${route.id} (${locale}).`);
  }
}

const sitemapEntries = await getSitemapEntries();
const sitemapLocs = new Set(sitemapEntries.map((entry) => entry.loc));
const expectedStaticSitemapCount = indexableStaticRoutes.length * SUPPORTED_LOCALES.length;

if (sitemapEntries.length < expectedStaticSitemapCount) {
  errors.push(`Sitemap has ${sitemapEntries.length} entries; expected at least ${expectedStaticSitemapCount}.`);
}
if (sitemapEntries.length !== sitemapLocs.size) errors.push("Sitemap contains duplicate loc values.");

for (const entry of sitemapEntries) {
  if (entry.alternates.length !== SUPPORTED_LOCALES.length) {
    errors.push(`Sitemap entry has incomplete alternates: ${entry.loc}`);
  }
  const defaultAlternate = entry.alternates.find((alternate) => alternate.locale === "zh-CN")?.href;
  if (!defaultAlternate || entry.xDefault !== defaultAlternate) {
    errors.push(`Sitemap entry has an invalid x-default alternate: ${entry.loc}`);
  }
  if (entry.priority < 0 || entry.priority > 1) errors.push(`Invalid sitemap priority: ${entry.loc}`);
  if (entry.lastmod && Number.isNaN(Date.parse(entry.lastmod))) errors.push(`Invalid sitemap lastmod: ${entry.loc}`);
}

if (errors.length > 0) {
  throw new Error(`[moenotes] search/SEO check failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

console.log(`[moenotes] search/SEO check passed (${searchItems.length} search routes, ${sitemapEntries.length} sitemap URLs).`);

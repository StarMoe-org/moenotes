import { SUPPORTED_LOCALES } from "../src/config/locales";
import { activeBuildLocales } from "../src/config/build-locales";
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

// The sitemap/hreflang assertions follow this build's active locale set rather than the full supported set,
// so a core-locale batch (MOENOTES_BUILD_LOCALES=core) is still fully valid against the same script.
const buildLocales = activeBuildLocales();

const sitemapEntries = await getSitemapEntries();
const sitemapLocs = new Set(sitemapEntries.map((entry) => entry.loc));
const expectedStaticSitemapCount = indexableStaticRoutes.length * buildLocales.length;

if (sitemapEntries.length < expectedStaticSitemapCount) {
  errors.push(`Sitemap has ${sitemapEntries.length} entries; expected at least ${expectedStaticSitemapCount}.`);
}
if (sitemapEntries.length !== sitemapLocs.size) errors.push("Sitemap contains duplicate loc values.");

for (const entry of sitemapEntries) {
  if (entry.alternates.length !== buildLocales.length) {
    errors.push(`Sitemap entry has incomplete alternates: ${entry.loc}`);
  }
  // x-default always points at the default-locale (zh-CN) version, regardless of which locales this batch
  // happens to list as alternates. Validate by re-deriving it from this entry's own pathname.
  const path = new URL(entry.loc).pathname.replace(/\/$/, "") || "/";
  const pathname = path.replace(/^\/(zh-tw|ja|en|ko|th|id|vi|es|pt|fr|de|ru)(?=\/|$)/, "") || "/";
  const expectedDefault = new URL(`${pathname === "/" ? "/" : `${pathname}/`}`, "https://bdon.moe/").toString();
  if (entry.xDefault !== expectedDefault) {
    errors.push(`Sitemap entry has an invalid x-default alternate: ${entry.loc} (x-default=${entry.xDefault}, expected=${expectedDefault})`);
  }
  if (entry.priority < 0 || entry.priority > 1) errors.push(`Invalid sitemap priority: ${entry.loc}`);
  if (entry.lastmod && Number.isNaN(Date.parse(entry.lastmod))) errors.push(`Invalid sitemap lastmod: ${entry.loc}`);
}

// Per-locale sitemap shards: every active locale's URLs must appear in exactly its own shard, with the build's
// full active locale set as the alternates of each entry in any shard. The shard set equals the sitemap index.
const shardLocales = [...new Set(sitemapEntries.map((entry) => entry.locale))];
if (shardLocales.length !== buildLocales.length || !buildLocales.every((locale) => shardLocales.includes(locale))) {
  errors.push(`Sitemap shards (${shardLocales.join(", ")}) do not match this build's active locales (${buildLocales.join(", ")}).`);
}

if (errors.length > 0) {
  throw new Error(`[moenotes] search/SEO check failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

console.log(`[moenotes] search/SEO check passed (${searchItems.length} search routes, ${sitemapEntries.length} sitemap URLs).`);

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, relative, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, "src");

const allowedStorageFiles = new Set([
  "src/lib/storage/safe-storage.ts",
  "src/lib/settings/apply-theme.ts",
]);

const allowedFetchFiles = new Set([
  "src/lib/masterdata/client.ts",
  "src/lib/masterdata/version.ts",
  "src/lib/search/dynamic-index.ts",
]);

const allowedDomainFiles = new Set([
  "src/config/assets.ts",
  "src/config/masterdata.ts",
  "src/config/site.ts",
]);

const allowedInternalRouteFiles = new Set([
  "src/config/routes.ts",
  "src/config/locales.ts",
  "src/config/assets.ts",
  "src/config/masterdata.ts",
  "src/i18n/routing.ts",
  "src/lib/route/registry.ts",
  "src/lib/route/static-paths.ts",
  "src/lib/seo/metadata.ts",
  "src/lib/seo/jsonld.ts",
  "src/pages/index.astro",
  "src/pages/robots.txt.ts",
  "src/pages/sitemap.xml.ts",
]);

const allowedProtocolUrls = [
  "https://schema.org",
  "http://www.sitemaps.org",
];

const scannedExtensions = new Set([".ts", ".tsx", ".astro"]);
const errors = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = resolve(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      if (name === "dist" || name === "node_modules" || name === ".astro") continue;
      walk(file);
      continue;
    }
    if (!scannedExtensions.has(extname(file))) continue;
    checkFile(file);
  }
}

function toRepoPath(file) {
  return relative(root, file).replace(/\\/g, "/");
}

function checkFile(file) {
  const repoPath = toRepoPath(file);
  const source = readFileSync(file, "utf8");

  if (!allowedStorageFiles.has(repoPath)) {
    if (/\b(?:localStorage|sessionStorage)\b/.test(source)) {
      errors.push(`${repoPath}: direct localStorage/sessionStorage usage is forbidden; use safe-storage or settings store.`);
    }
  }

  if (!allowedFetchFiles.has(repoPath)) {
    if (/\bfetch\s*\(/.test(source)) {
      errors.push(`${repoPath}: direct fetch() usage is forbidden; use a domain client module.`);
    }
  }

  if (!allowedDomainFiles.has(repoPath)) {
    const urls = [...source.matchAll(/https?:\/\/[^\s"'`<>]+/g)].map((match) => match[0]);
    const forbiddenUrls = urls.filter((url) => !allowedProtocolUrls.some((allowed) => url.startsWith(allowed)));
    if (forbiddenUrls.length > 0) {
      errors.push(`${repoPath}: hardcoded URL/domain is forbidden outside config: ${forbiddenUrls.join(", ")}`);
    }
  }

  if (!allowedInternalRouteFiles.has(repoPath)) {
    checkInternalRouteLiterals(repoPath, source);
  }
}

function checkInternalRouteLiterals(repoPath, source) {
  const literalMatches = [...source.matchAll(/(?<!@)["'](\/[a-z][a-z0-9\/-]*)["']/gi)];
  const forbidden = literalMatches
    .map((match) => match[1])
    .filter((value) => !isAllowedInternalPathLiteral(value));

  if (forbidden.length > 0) {
    errors.push(`${repoPath}: hardcoded internal route path is forbidden; use route id helpers instead: ${[...new Set(forbidden)].join(", ")}`);
  }
}

function isAllowedInternalPathLiteral(value) {
  if (value.startsWith("/favicon")) return true;
  if (value.startsWith("/_astro")) return true;
  if (value.includes(".")) return true;
  return false;
}

walk(srcDir);

if (errors.length > 0) {
  console.error("[moenotes] architecture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("[moenotes] architecture check passed.");

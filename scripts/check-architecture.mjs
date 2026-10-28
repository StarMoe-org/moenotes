import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, relative, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, "src");

const allowedStorageFiles = new Set([
  "src/lib/storage/safe-storage.ts",
  "src/lib/settings/apply-theme.ts",
  "src/lib/account/bootstrap.ts",
  "src/lib/filter/bootstrap.ts",
  "src/lib/browser/browser-notice.ts",
]);

const allowedFetchFiles = new Set([
  "src/lib/build/fetch.ts",
  "src/lib/masterdata/build-snapshot.ts",
  "src/lib/masterdata/client-version.ts",
  "src/lib/search/dynamic-index.ts",
  "src/components/cards/CardDetail.tsx",
  "src/components/characters/CharacterDetail.tsx",
  "src/components/comics/ComicsExplorer.tsx",
  "src/components/music/MusicDetail.tsx",
  "src/components/stamps/StampsExplorer.tsx",
  "src/components/support-cards/SupportCardDetail.tsx",
  "src/lib/assets/browser-client.ts",
  "src/lib/live2d/client.ts",
  "src/lib/story/player-client.ts",
  "src/lib/account/client.ts",
  "src/lib/account/game-accounts.ts",
  "src/lib/account/open-platform.ts",
  "src/lib/game-api/client.ts",
  "src/lib/chart-data/client.ts",
  "src/lib/game-ui/client.ts",
  "src/lib/band-items/upgrades-client.ts",
  "src/lib/characters/voices-client.ts",
  "src/lib/collectibles/image-client.ts",
  "src/lib/recognition/client.ts",
  "src/lib/deck/runtime-source.ts",
  "src/lib/guess-music/daily-client.ts",
  "src/lib/guess-music/practice-client.ts",
]);

const allowedDomainFiles = new Set([
  "src/config/assets.ts",
  "src/config/masterdata.ts",
  "src/config/site.ts",
  "src/config/analytics.ts",
  "src/config/game-api.ts",
]);

const allowedInternalRouteFiles = new Set([
  "src/config/routes.ts",
  "src/config/account.ts",
  "src/config/players.ts",
  "src/config/locales.ts",
  "src/config/assets.ts",
  "src/config/masterdata.ts",
  "src/config/servers.ts",
  "src/i18n/routing.ts",
  "src/lib/route/registry.ts",
  "src/lib/route/static-paths.ts",
  "src/lib/seo/metadata.ts",
  "src/lib/seo/jsonld.ts",
  "src/lib/markdown/negotiate.ts",
  "src/lib/markdown/render.ts",
  "src/components/shell/ShellBootClient.tsx",
  "src/proxy.ts",
  "src/app/layout.tsx",
  "src/app/not-found.tsx",
  "src/app/[[...segments]]/page.tsx",
  "src/app/api/v1/markdown/route.ts",
  "src/app/robots.txt/route.ts",
  "src/app/sitemap.xml/route.ts",
  "src/app/sitemaps/[locale]/route.ts",
  "src/app/api/v1/meta/version/route.ts",
]);

const allowedProtocolUrls = [
  "https://schema.org",
  "http://www.sitemaps.org",
  "http://www.w3.org/2000/svg",
  "https://github.com",
];

// pinyin-pro carries a dictionary of about 1 MB: the masterdata build computes the readings, pages receive only those.
const allowedPinyinFiles = new Set([
  "src/lib/masterdata/build-guess-music.ts",
]);

const scannedExtensions = new Set([".ts", ".tsx", ".astro"]);
const errors = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = resolve(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      if (name === "dist" || name === "node_modules" || name === ".astro" || name === ".next" || name === "out") continue;
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

  if (!allowedPinyinFiles.has(repoPath)) {
    if (/["']pinyin-pro["']/.test(source)) {
      errors.push(`${repoPath}: pinyin-pro is build-time only; compute readings in the masterdata build.`);
    }
  }

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

  checkMuiImports(repoPath, source);
  checkLegacyTokens(repoPath, source);
}

/**
 * The pre-Material-3 color, shadow and font tokens (--mn-accent, --mn-paper, --mn-shadow-stamp, …) and their
 * surface classes are retired: colors are M3 roles (--md-sys-color-* / bg-surface-container-low, text-primary, …).
 * Layout and data variables (--mn-layout-*, --mn-sidebar-offset, --mn-filter-*, --mn-density-*, --mn-cache-*,
 * chart data's --mn-cd-*) stay.
 */
const LEGACY_TOKEN = /--mn-(?:bg|paper|glass(?:-[a-z]+)?|surface(?:-strong)?|cream-deep|text(?:-muted)?|ink-soft|border|accent(?:-deep|-soft)?|rose|danger|mint(?:-deep|-soft)?|pink(?:-soft)?|cyan|amber|peach|yellow|orbit-[a-z]+|shadow(?:-stamp(?:-sm|-lg)?)?|panel-fill|overlay-shadow|radius-[a-z]+|dot-ink)\b/;
const LEGACY_CLASS = /(?:^|[\s"'`])(?:mn-paper|mn-glass|mn-card|mn-sticker|mn-stamp(?:-press(?:-lg)?)?|mn-focus|mn-system-section|mn-segmented|mn-stripes-cream|mn-texture-orbit|mn-orbit-[a-z]+)(?=[\s"'`])/;

function checkLegacyTokens(repoPath, source) {
  const token = source.match(LEGACY_TOKEN);
  if (token) errors.push(`${repoPath}: legacy token ${token[0]}; use the Material 3 roles (--md-sys-color-*, Tailwind bg-surface-* / text-on-*).`);
  const cls = source.match(LEGACY_CLASS);
  if (cls) errors.push(`${repoPath}: legacy class ${cls[0].trim()}; use the Material 3 primitives (md3-surface, md3-state, md3-segmented, …).`);
}

/**
 * Material 3 components come from MUI through path imports (`@mui/material/Button`), which keep every island's
 * bundle to the components it renders; the barrel (`@mui/material`) and `@mui/icons-material` are not used (the
 * site keeps its own line icons).
 */
function checkMuiImports(repoPath, source) {
  if (/from\s+["']@mui\/material["']/.test(source)) {
    errors.push(`${repoPath}: import MUI components by path (@mui/material/Button), not from the @mui/material barrel.`);
  }
  if (/from\s+["']@mui\/icons-material/.test(source)) {
    errors.push(`${repoPath}: @mui/icons-material is not used; draw icons as line SVGs (see RouteGlyph).`);
  }
}

function checkInternalRouteLiterals(repoPath, source) {
  const literalMatches = [...source.matchAll(/(?<!@)["'](\/[a-z][a-z0-9\/-]*)["']/gi)];
  const templateMatches = [...source.matchAll(/`(\/[a-z][a-z0-9\/-]*(?:\$\{[^}]+\}[a-z0-9\/-]*)+)`/gi)];
  const forbidden = [
    ...literalMatches.map((match) => match[1]),
    ...templateMatches.map((match) => match[1]),
  ].filter((value) => !isAllowedInternalPathLiteral(value));

  if (forbidden.length > 0) {
    errors.push(`${repoPath}: hardcoded internal route path is forbidden; use route id helpers instead: ${[...new Set(forbidden)].join(", ")}`);
  }
}

function isAllowedInternalPathLiteral(value) {
  if (value.startsWith("/favicon")) return true;
  if (value.startsWith("/_astro") || value.startsWith("/_next")) return true;
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

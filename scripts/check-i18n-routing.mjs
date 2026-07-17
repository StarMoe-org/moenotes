import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const astroConfig = readFileSync(resolve(root, "astro.config.mjs"), "utf8");
const localesConfig = readFileSync(resolve(root, "src/config/locales.ts"), "utf8");
const staticPaths = readFileSync(resolve(root, "src/lib/route/static-paths.ts"), "utf8");

const errors = [];

function extractStringConst(source, name) {
  return source.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1] ?? null;
}

const astroDefaultLocale = astroConfig.match(/defaultLocale:\s*"([^"]+)"/)?.[1] ?? null;
const customDefaultLocale = extractStringConst(localesConfig, "DEFAULT_LOCALE");

if (astroDefaultLocale !== customDefaultLocale) {
  errors.push(`defaultLocale mismatch: astro=${astroDefaultLocale}, custom=${customDefaultLocale}`);
}

const astroLocaleObjects = [...astroConfig.matchAll(/\{\s*path:\s*"([^"]+)",\s*codes:\s*\["([^"]+)"\]\s*\}/g)]
  .map((match) => ({ path: match[1], locale: match[2] }));
const astroPlainLocales = [...astroConfig.matchAll(/^\s*"([a-z]{2}(?:-[A-Z]{2})?)",?\s*$/gm)].map((match) => match[1]);

const supportedLocales = [...localesConfig.matchAll(/SUPPORTED_LOCALES = \[([^\]]+)\]/gs)]
  .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]));

const prefixEntries = [...localesConfig.matchAll(/"([^"]+)":\s*"([^"]*)"/g)]
  .filter((match) => supportedLocales.includes(match[1]))
  .map((match) => ({ locale: match[1], path: match[2] }));

for (const locale of astroPlainLocales) {
  const custom = prefixEntries.find((entry) => entry.locale === locale);
  if (!custom) errors.push(`Astro plain locale ${locale} missing in LOCALE_PATH_PREFIX`);
  if (locale === customDefaultLocale && custom?.path !== "") {
    errors.push(`Default locale ${locale} must use empty path prefix, got ${custom?.path}`);
  }
}

for (const astroLocale of astroLocaleObjects) {
  const custom = prefixEntries.find((entry) => entry.locale === astroLocale.locale);
  if (!custom) {
    errors.push(`Astro locale ${astroLocale.locale} missing in LOCALE_PATH_PREFIX`);
    continue;
  }
  if (custom.path !== astroLocale.path) {
    errors.push(`Locale prefix mismatch for ${astroLocale.locale}: astro=${astroLocale.path}, custom=${custom.path}`);
  }
  const prefixLocaleMarker = `${astroLocale.path}: "${astroLocale.locale}"`;
  const quotedPrefixLocaleMarker = `"${astroLocale.path}": "${astroLocale.locale}"`;
  if (!localesConfig.includes(prefixLocaleMarker) && !localesConfig.includes(quotedPrefixLocaleMarker)) {
    errors.push(`PATH_PREFIX_LOCALE missing ${astroLocale.path}: ${astroLocale.locale}`);
  }
}

if (!/prefixDefaultLocale:\s*false/.test(astroConfig)) {
  errors.push("Astro prefixDefaultLocale must remain false unless localizePath/static paths are updated.");
}

if (!staticPaths.includes("SUPPORTED_LOCALES") || !staticPaths.includes("LOCALE_PATH_PREFIX") || !staticPaths.includes("DEFAULT_LOCALE")) {
  errors.push("static-paths.ts must derive paths from locale config constants.");
}

if (errors.length > 0) {
  console.error("[moenotes] i18n routing check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("[moenotes] i18n routing check passed.");

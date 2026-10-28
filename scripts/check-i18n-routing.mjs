import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localesConfig = readFileSync(resolve(root, "src/config/locales.ts"), "utf8");
const siteJson = JSON.parse(readFileSync(resolve(root, "server/internal/siteconfig/site.json"), "utf8"));
const staticPaths = readFileSync(resolve(root, "src/lib/route/static-paths.ts"), "utf8");
const routingSource = readFileSync(resolve(root, "src/i18n/routing.ts"), "utf8");
const proxySource = readFileSync(resolve(root, "src/proxy.ts"), "utf8");

const errors = [];

function extractStringConst(source, name) {
  return source.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1] ?? null;
}

const customDefaultLocale = extractStringConst(localesConfig, "DEFAULT_LOCALE");
if (!customDefaultLocale) {
  errors.push("DEFAULT_LOCALE missing in src/config/locales.ts");
}

const supportedLocales = [...localesConfig.matchAll(/SUPPORTED_LOCALES = \[([^\]]+)\]/gs)]
  .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]));

const prefixEntries = [...localesConfig.matchAll(/"([^"]+)":\s*"([^"]*)"/g)]
  .filter((match) => supportedLocales.includes(match[1]))
  .map((match) => ({ locale: match[1], path: match[2] }));

for (const locale of supportedLocales) {
  const custom = prefixEntries.find((entry) => entry.locale === locale);
  if (!custom) {
    errors.push(`Locale ${locale} missing in LOCALE_PATH_PREFIX`);
    continue;
  }
  if (locale === customDefaultLocale) {
    if (custom.path !== "") {
      errors.push(`Default locale ${locale} must use empty path prefix, got ${custom.path}`);
    }
  } else {
    const prefixLocaleMarker = `${custom.path}: "${locale}"`;
    const quotedPrefixLocaleMarker = `"${custom.path}": "${locale}"`;
    if (!localesConfig.includes(prefixLocaleMarker) && !localesConfig.includes(quotedPrefixLocaleMarker)) {
      errors.push(`PATH_PREFIX_LOCALE missing ${custom.path}: ${locale}`);
    }
  }
}

// Verify Go server site.json matches src/config/locales.ts exactly.
const serverLocales = Array.isArray(siteJson.locales) ? siteJson.locales : [];
if (serverLocales.length !== supportedLocales.length) {
  errors.push(`server site.json locale count (${serverLocales.length}) !== SUPPORTED_LOCALES (${supportedLocales.length})`);
}
for (const entry of serverLocales) {
  const custom = prefixEntries.find((item) => item.locale === entry.code);
  if (!custom) {
    errors.push(`server site.json locale ${entry.code} missing in src/config/locales.ts`);
  } else if (custom.path !== entry.prefix) {
    errors.push(`Locale prefix mismatch for ${entry.code}: server=${entry.prefix}, frontend=${custom.path}`);
  }
}

if (!staticPaths.includes("SUPPORTED_LOCALES") || !staticPaths.includes("LOCALE_PATH_PREFIX") || !staticPaths.includes("DEFAULT_LOCALE")) {
  errors.push("static-paths.ts must derive paths from locale config constants.");
}

if (!routingSource.includes("PATH_PREFIX_LOCALE") || !proxySource.includes("getLocaleFromPathname")) {
  errors.push("Next.js routing and proxy.ts must resolve locales through src/i18n/routing.ts.");
}

if (errors.length > 0) {
  console.error("[moenotes] i18n routing check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("[moenotes] i18n routing check passed.");

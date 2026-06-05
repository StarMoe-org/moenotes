import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routesFile = resolve(root, "src/config/routes.ts");
const source = readFileSync(routesFile, "utf8");

const idMatches = [...source.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);
const pathMatches = [...source.matchAll(/path:\s*"(\/[^"]*)"/g)].map((match) => match[1]);
const labelMatches = [...source.matchAll(/labelKey:\s*"([^"]+)"/g)].map((match) => match[1]);
const titleMatches = [...source.matchAll(/titleKey:\s*"([^"]+)"/g)].map((match) => match[1]);
const descriptionMatches = [...source.matchAll(/descriptionKey:\s*"([^"]+)"/g)].map((match) => match[1]);

const errors = [];

function checkDuplicates(values, name) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) errors.push(`Duplicate ${name}: ${value}`);
    seen.add(value);
  }
}

checkDuplicates(idMatches, "route id");
checkDuplicates(pathMatches, "route path");

for (const path of pathMatches) {
  if (!path.startsWith("/")) errors.push(`Route path must start with /: ${path}`);
  if (path.length > 1 && path.endsWith("/")) errors.push(`Route path must not end with /: ${path}`);
}

const nonHomeRouteCount = pathMatches.filter((path) => path !== "/").length;
const expectedLocalizedPathCount = nonHomeRouteCount * 3 + 2;
if (expectedLocalizedPathCount <= nonHomeRouteCount) {
  errors.push("Static localized path count invariant failed");
}

for (const [name, values] of Object.entries({ labelKey: labelMatches, titleKey: titleMatches, descriptionKey: descriptionMatches })) {
  for (const value of values) {
    if (!value.includes(".")) errors.push(`${name} should be a dotted i18n key: ${value}`);
  }
}

if (errors.length > 0) {
  console.error("[moenotes] route registry check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[moenotes] route registry check passed (${idMatches.length} routes, ${expectedLocalizedPathCount} localized static paths).`);

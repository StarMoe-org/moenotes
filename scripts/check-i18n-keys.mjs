import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localeFiles = {
  "zh-CN": resolve(root, "src/i18n/messages/zh-CN.ts"),
  "zh-TW": resolve(root, "src/i18n/messages/zh-TW.ts"),
  "ja-JP": resolve(root, "src/i18n/messages/ja-JP.ts"),
  "en-US": resolve(root, "src/i18n/messages/en-US.ts"),
  "ko-KR": resolve(root, "src/i18n/messages/ko-KR.ts"),
  "th-TH": resolve(root, "src/i18n/messages/th-TH.ts"),
  "id-ID": resolve(root, "src/i18n/messages/id-ID.ts"),
  "vi-VN": resolve(root, "src/i18n/messages/vi-VN.ts"),
  "es-ES": resolve(root, "src/i18n/messages/es-ES.ts"),
  "pt-BR": resolve(root, "src/i18n/messages/pt-BR.ts"),
  "fr-FR": resolve(root, "src/i18n/messages/fr-FR.ts"),
  "de-DE": resolve(root, "src/i18n/messages/de-DE.ts"),
  "ru-RU": resolve(root, "src/i18n/messages/ru-RU.ts"),
};

function loadMessageObject(file, exportName) {
  let source = readFileSync(file, "utf8");
  source = source.replace(/import[^;]+;\s*/g, "");
  source = source.replace(/as const satisfies MessageTree/g, "");
  source = source.replace(new RegExp(`export const ${exportName} =`), "module.exports =");
  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(source, context, { filename: file });
  return context.module.exports;
}

function flattenKeys(object, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(object)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") keys.push(next);
    else if (value && typeof value === "object") keys.push(...flattenKeys(value, next));
  }
  return keys;
}

const messages = {
  "zh-CN": loadMessageObject(localeFiles["zh-CN"], "zhCN"),
  "zh-TW": loadMessageObject(localeFiles["zh-TW"], "zhTW"),
  "ja-JP": loadMessageObject(localeFiles["ja-JP"], "jaJP"),
  "en-US": loadMessageObject(localeFiles["en-US"], "enUS"),
  "ko-KR": loadMessageObject(localeFiles["ko-KR"], "koKR"),
  "th-TH": loadMessageObject(localeFiles["th-TH"], "thTH"),
  "id-ID": loadMessageObject(localeFiles["id-ID"], "idID"),
  "vi-VN": loadMessageObject(localeFiles["vi-VN"], "viVN"),
  "es-ES": loadMessageObject(localeFiles["es-ES"], "esES"),
  "pt-BR": loadMessageObject(localeFiles["pt-BR"], "ptBR"),
  "fr-FR": loadMessageObject(localeFiles["fr-FR"], "frFR"),
  "de-DE": loadMessageObject(localeFiles["de-DE"], "deDE"),
  "ru-RU": loadMessageObject(localeFiles["ru-RU"], "ruRU"),
};

const flattened = Object.fromEntries(Object.entries(messages).map(([locale, tree]) => [locale, new Set(flattenKeys(tree))]));
const base = flattened["zh-CN"];
const errors = [];

for (const [locale, keys] of Object.entries(flattened)) {
  for (const key of base) {
    if (!keys.has(key)) errors.push(`${locale} missing key: ${key}`);
  }
  for (const key of keys) {
    if (!base.has(key)) errors.push(`${locale} has extra key not in zh-CN: ${key}`);
  }
}

const routeSource = readFileSync(resolve(root, "src/config/routes.ts"), "utf8");
const routeKeys = [
  ...routeSource.matchAll(/(?:labelKey|titleKey|descriptionKey):\s*"([^"]+)"/g),
].map((match) => match[1]);
for (const key of routeKeys) {
  if (!base.has(key)) errors.push(`route registry references missing i18n key: ${key}`);
}

if (errors.length > 0) {
  console.error("[moenotes] i18n key check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[moenotes] i18n key check passed (${base.size} keys).`);

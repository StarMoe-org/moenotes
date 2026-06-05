import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, relative, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, "src");
const scannedExtensions = new Set([".astro", ".tsx", ".ts"]);
const cjkPattern = /[\u3040-\u30ff\u3400-\u9fff]/;

const ignoredPathPrefixes = [
  "src/i18n/",
  "src/config/",
  "src/types/",
];

const ignoredFiles = new Set([
  "src/env.d.ts",
]);

const allowedLiteralPatterns = [
  /schema\.org/,
  /sitemaps\.org/,
];

const errors = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = resolve(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      if (["node_modules", "dist", ".astro"].includes(name)) continue;
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

function shouldIgnoreFile(repoPath) {
  if (ignoredFiles.has(repoPath)) return true;
  return ignoredPathPrefixes.some((prefix) => repoPath.startsWith(prefix));
}

function checkFile(file) {
  const repoPath = toRepoPath(file);
  if (shouldIgnoreFile(repoPath)) return;

  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!cjkPattern.test(line)) return;
    if (line.includes("i18n-allow-hardcoded")) return;
    if (allowedLiteralPatterns.some((pattern) => pattern.test(line))) return;
    errors.push(`${repoPath}:${index + 1}: hardcoded CJK UI text is forbidden; move it to i18n messages or add an explicit i18n-allow-hardcoded comment.`);
  });
}

walk(srcDir);

if (errors.length > 0) {
  console.error("[moenotes] hardcoded UI text check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("[moenotes] hardcoded UI text check passed.");

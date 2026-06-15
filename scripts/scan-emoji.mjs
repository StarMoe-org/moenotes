import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["src", ".miaomiaomiao/src"];
const exts = new Set([".astro", ".ts", ".tsx", ".css"]);
const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const deniedCodePoints = [0x2605, 0x2726, 0x266A, 0x266B, 0x2630, 0x2699, 0x2713, 0x2B55, 0x2122, 0xFE0F];
const deniedChars = new Set(deniedCodePoints.map((codePoint) => String.fromCodePoint(codePoint)));

function extensionOf(file) {
  return extname(file);
}

function walk(dir, files = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path, files);
      continue;
    }
    if (exts.has(extensionOf(path))) files.push(path);
  }
  return files;
}

const hits = [];
const missingRequiredRoots = [];

for (const root of roots) {
  const absoluteRoot = resolve(repoRoot, root);
  if (!existsSync(absoluteRoot)) {
    if (root === "src") missingRequiredRoots.push(root);
    continue;
  }

  for (const file of walk(absoluteRoot)) {
    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const chars = Array.from(line).filter((char) => emojiPattern.test(char) || deniedChars.has(char));
      if (chars.length > 0) {
        if (line.includes("emoji-allow")) return;
        hits.push({
          file: relative(repoRoot, file).replace(/\\/g, "/"),
          line: index + 1,
          chars: [...new Set(chars)].join(" "),
          text: line.trim(),
        });
      }
    });
  }
}

if (missingRequiredRoots.length > 0) {
  console.error(`Required scan roots are missing: ${missingRequiredRoots.join(", ")}`);
  process.exit(1);
}

if (hits.length > 0) {
  console.error("Emoji or decorative characters were found:");
  for (const hit of hits) {
    console.error(`${hit.file}:${hit.line} [${hit.chars}] ${hit.text}`);
  }
  process.exit(1);
}

console.log("Emoji scan passed.");

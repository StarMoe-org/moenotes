import { rmSync } from "node:fs";
import { resolve } from "node:path";

const cachePaths = [
  ".astro",
  "node_modules/.vite",
];

for (const cachePath of cachePaths) {
  const absolutePath = resolve(cachePath);
  rmSync(absolutePath, { recursive: true, force: true });
  console.log(`Cleared ${cachePath}`);
}

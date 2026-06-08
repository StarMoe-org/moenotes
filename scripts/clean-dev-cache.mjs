import { rmSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const cachePaths = [
  ".astro",
  "node_modules/.vite",
];

for (const cachePath of cachePaths) {
  const absolutePath = resolve(cachePath);
  if (existsSync(absolutePath)) {
    try {
      const files = readdirSync(absolutePath);
      for (const file of files) {
        rmSync(join(absolutePath, file), { recursive: true, force: true });
      }
      console.log(`Cleared contents of ${cachePath}`);
    } catch (err) {
      // Fallback to removing the directory if reading/deleting contents failed
      rmSync(absolutePath, { recursive: true, force: true });
      console.log(`Cleared ${cachePath} (fallback)`);
    }
  } else {
    console.log(`${cachePath} does not exist, skipping`);
  }
}

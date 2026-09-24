import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Supply a downloaded object-index manifest. Only relative keys are published.
const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/sync-release-assets.mjs <manifest.json>");
const manifest = JSON.parse(readFileSync(input, "utf8"));
if (manifest.schema !== "moenotes-assets-object-index/v1") throw new Error("Unsupported asset manifest");
const images = {}, stories = {}, audio = {};
const imageScope = /^(Character\/(Image|Skill)\/|Band\/\d+\/band_|MemberCard\/|SupportCard\/|Image\/(Jacket|Comic|Banner)\/|Item\/|Stamp\/|Story\/|Gacha\/(Banner|Logo)\/|SeasonPass\/Banner\/)/;
const safePath = (path) => typeof path === "string" && !path.includes(":") && !path.includes("\\") && !path.startsWith("/") && !path.split("/").includes("..");
const audioCandidates = new Map();
for (const entry of [...manifest.objects].sort((a, b) => a.object_key.localeCompare(b.object_key, "en"))) {
  const { asset_key: key, object_key: object, label, content_type: type } = entry;
  if (!safePath(key) || !safePath(object)) throw new Error("Manifest contains a non-relative key");
  if (entry.role !== "asset") continue;
  if (type === "image/png" && imageScope.test(key) && label === key.split("/").at(-1)) {
    // Exact source label, never a cropped face/formation variant or thumbnail.
    images[key] ??= object;
  }
  const story = key.match(/^Adv\/Episode\/([^/]+)\/\1-(Episode|Text|Sound|SoundCueSheet|Video)$/);
  if (story && type === "application/json" && object === `${key}/${key.split("/").at(-1)}.json`) {
    (stories[story[1]] ??= []).push(story[2]);
  }
  if (type === "audio/mp4" && key.startsWith("Cri/Sound/")) {
    const id = `${key}\n${label}`;
    const candidates = audioCandidates.get(id) ?? [];
    candidates.push(entry);
    audioCandidates.set(id, candidates);
  }
}
let ambiguousAudio = 0;
for (const candidates of audioCandidates.values()) {
  if (new Set(candidates.map((entry) => entry.sha256)).size !== 1) { ambiguousAudio++; continue; }
  const entry = candidates[0];
  (audio[entry.asset_key] ??= {})[entry.label] = entry.object_key.slice(entry.asset_key.length + 1);
}
const directory = resolve("src/lib/assets/generated");
mkdirSync(directory, { recursive: true });
for (const [name, data] of Object.entries({ images, stories, audio })) {
  writeFileSync(resolve(directory, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
}
console.log(JSON.stringify({ images: Object.keys(images).length, stories: Object.keys(stories).length, audioSheets: Object.keys(audio).length, ambiguousAudio }));

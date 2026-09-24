import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Indexes published exports of the moenotes-assets service for every language of one region.
// Usage: node scripts/sync-release-assets.mjs [--api=https://assets.bdon.moe] [--region=tw]
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = arg.match(/^--(api|region)=(.+)$/);
  if (!match) throw new Error("Usage: node scripts/sync-release-assets.mjs [--api=<url>] [--region=<id>]");
  return [match[1], match[2]];
}));
const api = (options.api ?? "https://assets.bdon.moe").replace(/\/+$/, "");
const regionId = options.region ?? "tw";
// Non-video export profile. The service names exports sha256(JSON [snapshot, key, profile]); no public route looks them up by key.
const profile = "csharp-json-png-webp-aac-h264-v3";
const cacheDir = resolve("node_modules/.cache/moenotes-assets/exports");

const imageScope = /^(Character\/(Image|Skill)\/|Band\/\d+\/band_|MemberCard\/|SupportCard\/|Image\/(Jacket|Comic|Banner|Degree|Background|Spot)\/|thumbnail\/Background\/|Item\/|Stamp\/|Story\/|Gacha\/(Banner|Logo)\/|SeasonPass\/Banner\/|LoginBonus\/Sprite\/)/;
const storyKey = /^Adv\/Episode\/([^/]+)\/\1-(Episode|Text|Sound|SoundCueSheet|Video)$/;
const audioKey = /^Cri\/Sound\/[^/]+$/;

const exportId = (snapshot, key) => createHash("sha256").update(JSON.stringify([snapshot, key, profile])).digest("hex");
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

async function getJson(path, { allowMissing = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${api}${path}`, { headers: { Accept: "application/json" } });
      if (allowMissing && response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
      return await response.json();
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((done) => setTimeout(done, attempt * 500));
    }
  }
}

async function mapConcurrent(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

async function listKeys(snapshot) {
  const keys = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await getJson(`/assets?snapshot=${snapshot}&offset=${offset}&limit=1000`);
    if (page.snapshot !== snapshot || page.offset !== offset) throw new Error("Unexpected asset page");
    for (const asset of page.assets) {
      if (!asset.ambiguous && (imageScope.test(asset.key) || storyKey.test(asset.key) || audioKey.test(asset.key))) keys.push(asset.key);
    }
    if (offset + page.assets.length >= page.total || page.assets.length === 0) return keys;
  }
}

// Manifests are immutable per export ID, so only published ones are cached; a 404 may be exported later.
async function manifestFor(snapshot, key) {
  const id = exportId(snapshot, key);
  const file = resolve(cacheDir, `${id}.json`);
  const manifest = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : await getJson(`/exports/${id}`, { allowMissing: true });
  if (!manifest) return null;
  if (manifest.id !== id || manifest.snapshot !== snapshot || manifest.key !== key || manifest.profile !== profile || !Array.isArray(manifest.files)) {
    throw new Error(`Unexpected manifest for ${key}`);
  }
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(manifest));
  return manifest;
}

// One output per key and language: `content` compares languages, `id` is what the site requests.
function outputOf(key, manifest) {
  const name = key.split("/").at(-1);
  if (imageScope.test(key)) {
    // Exact source label, never a cropped face/formation variant.
    const file = manifest.files.find((entry) => entry.media_type === "image/webp" && entry.label === name);
    return file && { kind: "images", id: file.id, content: file.sha256 };
  }
  if (storyKey.test(key)) {
    const file = manifest.files.find((entry) => entry.media_type === "application/json" && entry.label === name);
    return file && { kind: "stories", id: file.id, content: file.sha256 };
  }
  // Audio keeps the export ID: the site reads cue labels from the manifest instead of shipping every cue's file ID.
  const cues = manifest.files.filter((entry) => entry.media_type === "audio/mp4").map((entry) => `${entry.label}\n${entry.sha256}`);
  return cues.length > 0 && { kind: "audio", id: manifest.id, content: cues.sort(byKey).join("\n") };
}

// A single ID when every language publishes the same content; otherwise IDs by language, shared where content matches.
function mergeLanguages(outputs, languages) {
  const idByContent = new Map();
  const ids = {};
  for (const language of languages) {
    const output = outputs.get(language);
    if (!output) continue;
    if (!idByContent.has(output.content)) idByContent.set(output.content, output.id);
    ids[language] = idByContent.get(output.content);
  }
  return idByContent.size === 1 ? idByContent.values().next().value : ids;
}

mkdirSync(cacheDir, { recursive: true });
const region = (await getJson("/regions")).find((entry) => entry.id === regionId);
if (!region) throw new Error(`Region ${regionId} is not configured on ${api}`);
const languages = [...new Set([region.default_locale, ...region.locales])];
const outputs = { images: new Map(), stories: new Map(), audio: new Map() };
const snapshots = {};
let unpublished = 0;

for (const language of languages) {
  const catalog = (await getJson(`/catalogs?region=${encodeURIComponent(regionId)}&locale=${encodeURIComponent(language)}`)).find((entry) => entry.current);
  if (!catalog) throw new Error(`No current ${regionId}/${language} catalog`);
  snapshots[language] = catalog.snapshot;
  const keys = await listKeys(catalog.snapshot);
  const manifests = await mapConcurrent(keys, 32, (key) => manifestFor(catalog.snapshot, key));
  keys.forEach((key, index) => {
    const output = manifests[index] ? outputOf(key, manifests[index]) : undefined;
    if (!manifests[index]) unpublished++;
    if (!output) return;
    const byLanguage = outputs[output.kind].get(key) ?? new Map();
    byLanguage.set(language, output);
    outputs[output.kind].set(key, byLanguage);
  });
  console.error(`${language}: ${keys.length} keys, ${manifests.filter(Boolean).length} published`);
}

const merged = Object.fromEntries(Object.entries(outputs).map(([kind, entries]) => [
  kind,
  [...entries.keys()].sort(byKey).map((key) => [key, mergeLanguages(entries.get(key), languages)]),
]));
const images = Object.fromEntries(merged.images);
const audio = Object.fromEntries(merged.audio);
const stories = {};
for (const [key, entry] of merged.stories) {
  const [, script, table] = key.match(storyKey);
  (stories[script] ??= {})[table] = entry;
}

const directory = resolve("src/lib/assets/generated");
mkdirSync(directory, { recursive: true });
for (const [name, data] of Object.entries({ images, stories, audio })) {
  writeFileSync(resolve(directory, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
}
const localized = (entries) => entries.filter(([, entry]) => typeof entry !== "string").length;
console.log(JSON.stringify({
  api,
  region: regionId,
  snapshots,
  images: merged.images.length,
  localizedImages: localized(merged.images),
  stories: Object.keys(stories).length,
  storyTables: merged.stories.length,
  audioSheets: merged.audio.length,
  localizedAudioSheets: localized(merged.audio),
  unpublishedKeyLanguages: unpublished,
}, null, 2));

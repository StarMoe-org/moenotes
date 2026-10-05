import type { GameServer } from "@/config/servers";
import type { UIPack } from "ournotes-player/ui";
import type { NativeCardCatalog, NativeSpriteGeometry } from "./card-fixture";
import { fetchNativeUiResource } from "./client";
import { withWebsiteUiFont } from "./website-font";

export type NativeUiEntry = "formationSlot" | "memberSquare" | "supportSquare" | "formationGroup";
interface FileRecord { file?: string; sha256: string; size: number; mime: string }
export type NativeDynamicSprites = Readonly<Record<string, FileRecord & { file: string }>>;
export type NativeSpriteBitmaps = NativeDynamicSprites;
export interface NativeUiRect { x: number; y: number; width: number; height: number }
export interface NativeFormationLayout {
  schema: "moenotes.game-ui-formation-layout/1";
  sourcePack: FileRecord & { file: string };
  rootPath: string;
  rootRect: NativeUiRect;
  leaderSlot: 2;
  slots: Array<{ slotIndex: number; slotPath: string; memberPath: string; supportPath: string; targetMemberRect: NativeUiRect; targetSupportRect: NativeUiRect }>;
  sourceCamera: FileRecord & { file: string; cameraPath: string; canvasPath: string; referenceViewport: [number, number] };
}
export interface NativeUiManifest {
  schema: "moenotes.game-ui-library/1";
  region: GameServer;
  client: { versionName: string; versionCode: number };
  index: FileRecord & { file: string };
  bindingSources: FileRecord & { file: string };
  spriteGeometries: FileRecord & { file: string };
  entries: Record<NativeUiEntry, { id: string; file: string }>;
  files: Record<string, FileRecord>;
  /** Exact decoded Sprite keys. Their files are fetched and verified on first use. */
  dynamicSprites?: NativeDynamicSprites;
  /** Authoritative tight bitmaps for these exact keys; other artwork keeps its published URL. */
  spriteBitmaps?: NativeSpriteBitmaps;
  layout: NativeFormationLayout;
}
export interface NativeUiLibrary {
  manifest: NativeUiManifest;
  pack: (entry: NativeUiEntry) => UIPack;
  catalogs: NativeCardCatalog[];
  spriteGeometries: Readonly<Record<string, { geometry: NativeSpriteGeometry }>>;
  camera: { camera: Record<string, unknown>; canvas: Record<string, unknown>; referenceViewport: [number, number] };
  assetBase: string;
  spriteUrl: (spriteKey: string) => Promise<string>;
}
const libraries = new Map<string, Promise<NativeUiLibrary>>();
const safePath = (path: string) => /^[a-zA-Z0-9_.\/-]+$/.test(path) && !path.split("/").some(part => part === ".." || !part);
export function validateNativeUiManifest(value: unknown, region: GameServer): NativeUiManifest {
  const manifest = value as NativeUiManifest;
  if (!manifest || manifest.schema !== "moenotes.game-ui-library/1" || manifest.region !== region || !manifest.entries || !manifest.files
    || !manifest.client?.versionName || !Number.isSafeInteger(manifest.client.versionCode)) throw new Error("UI library source identity differs");
  for (const [path, record] of Object.entries(manifest.files)) {
    if (!safePath(path) || !record || !/^[a-f0-9]{64}$/.test(record.sha256) || !Number.isSafeInteger(record.size) || record.size < 0
      || record.size > 40_000_000 || typeof record.mime !== "string") throw new Error("Invalid UI library resource");
  }
  for (const name of ["formationSlot", "memberSquare", "supportSquare", "formationGroup"] as const) {
    const entry = manifest.entries[name];
    if (!entry?.id || !manifest.files[entry.file]) throw new Error("UI prefab is missing from its source");
  }
  if (manifest.dynamicSprites !== undefined && manifest.spriteBitmaps !== undefined) throw new Error("UI Sprite image contracts are mutually exclusive");
  for (const [sprites, label] of [[manifest.dynamicSprites, "Dynamic Sprite"], [manifest.spriteBitmaps, "Sprite bitmap"]] as const) {
    if (sprites === undefined) continue;
    if (!sprites || typeof sprites !== "object" || Array.isArray(sprites)) throw new Error(`Invalid ${label} directory`);
    for (const [key, record] of Object.entries(sprites)) {
      const listed = record && manifest.files[record.file];
      if (!/^[^\[\]\r\n]+\[[^\[\]\r\n]+\]$/.test(key) || !listed || !Object.hasOwn(manifest.files, record.file) || !listed.mime.startsWith("image/")
        || listed.sha256 !== record.sha256 || listed.size !== record.size || listed.mime !== record.mime) throw new Error(`${label} identity differs from its source`);
    }
  }
  for (const record of [manifest.index, manifest.bindingSources, manifest.spriteGeometries, manifest.layout?.sourceCamera]) {
    const listed = record && manifest.files[record.file];
    if (!listed || listed.sha256 !== record.sha256 || listed.size !== record.size) throw new Error("UI index identity differs");
  }
  const layout = manifest.layout, listed = layout && manifest.files[layout.sourcePack?.file];
  const rect = (value: NativeUiRect | undefined) => value && [value.x, value.y, value.width, value.height].every(Number.isFinite)
    && value.width > 0 && value.height > 0;
  if (!layout || layout.schema !== "moenotes.game-ui-formation-layout/1" || layout.leaderSlot !== 2 || !layout.rootPath || !rect(layout.rootRect)
    || layout.sourcePack.file !== manifest.entries.formationGroup.file || !listed || listed.sha256 !== layout.sourcePack.sha256 || listed.size !== layout.sourcePack.size
    || !Array.isArray(layout.slots) || layout.slots.length !== 5 || new Set(layout.slots.map(slot => slot.slotPath)).size !== 5
    || layout.slots.some((slot, i) => slot.slotIndex !== i || !slot.slotPath.startsWith(`${layout.rootPath}/`)
      || !slot.memberPath?.startsWith(`${slot.slotPath}/`) || !slot.supportPath?.startsWith(`${slot.slotPath}/`)
      || !rect(slot.targetMemberRect) || !rect(slot.targetSupportRect))) {
    throw new Error("UI formation layout differs from its source");
  }
  return manifest;
}
const digest = async (bytes: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");

/** Bundle-only requests must select one actual decoded Sprite, never a guessed file name. */
export function resolveNativeSpriteKey(sprites: NativeDynamicSprites, requested: string): string {
  if (Object.hasOwn(sprites, requested)) return requested;
  const matches = requested.includes("[") ? [] : Object.keys(sprites).filter(key => key.startsWith(`${requested}[`));
  if (matches.length !== 1) throw new Error(`Dynamic Sprite is missing or ambiguous: ${requested}`);
  return matches[0]!;
}

/** Share only SHA-checked blobs. Failed requests can be retried; unused gallery files stay unloaded. */
export function createNativeSpriteLoader(sprites: NativeDynamicSprites, base: string, requireExactKeys = false): (spriteKey: string) => Promise<string> {
  const files = new Map<string, Promise<string>>();
  return requested => {
    if (requireExactKeys && !Object.hasOwn(sprites, requested)) throw new Error(`Sprite bitmap is not declared: ${requested}`);
    const key = resolveNativeSpriteKey(sprites, requested), record = sprites[key]!;
    let pending = files.get(record.file);
    if (!pending) {
      pending = (async () => {
        const response = await fetchNativeUiResource(new URL(record.file, base));
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== record.size || await digest(bytes) !== record.sha256) throw new Error(`Dynamic Sprite content differs: ${key}`);
        return URL.createObjectURL(new Blob([bytes], { type: record.mime }));
      })().catch(error => { files.delete(record.file); throw error; });
      files.set(record.file, pending);
    }
    return pending;
  };
}

/** Verify the exported closure once, then render only these pinned bytes through the companion player. */
export function loadNativeUiLibrary(url: string, region: GameServer): Promise<NativeUiLibrary> {
  const key = `${region}:${url}`;
  if (!libraries.has(key)) libraries.set(key, (async () => {
    if (!url) throw new Error("UI library is not configured");
    const manifestUrl = new URL(url, typeof location === "undefined" ? undefined : location.href).href;
    const base = new URL(".", manifestUrl).href;
    const response = await fetchNativeUiResource(manifestUrl);
    const manifest = validateNativeUiManifest(await response.json(), region);
    const bytes = new Map<string, ArrayBuffer>();
    const fetchFile = async (path: string) => {
      if (bytes.has(path)) return;
      const record = manifest.files[path];
      if (!record) throw new Error(`UI resource is outside the verified closure: ${path}`);
      const response = await fetchNativeUiResource(new URL(path, base));
      const data = await response.arrayBuffer();
      if (data.byteLength !== record.size || await digest(data) !== record.sha256) throw new Error(`UI resource content differs: ${path}`);
      bytes.set(path, data);
    };
    const documents = new Set([manifest.index.file, manifest.bindingSources.file, manifest.spriteGeometries.file,
      manifest.layout.sourceCamera.file, ...Object.values(manifest.entries).map(entry => entry.file)]);
    await Promise.all([...documents].map(fetchFile));
    const json = (path: string) => JSON.parse(new TextDecoder().decode(bytes.get(path)));
    const packs = new Map<NativeUiEntry, UIPack>();
    for (const [name, entry] of Object.entries(manifest.entries)) {
      const pack = json(entry.file) as UIPack;
      if (!Array.isArray(pack.document?.nodes) || !pack.resources) throw new Error("UI prefab has no serialized nodes");
      packs.set(name as NativeUiEntry, withWebsiteUiFont(pack));
    }
    // Text no longer needs native TTF/SDF files. Shared Sprite/RawImage textures still do.
    const textures = new Set([...packs.values()].flatMap(pack => Object.values(pack.resources.textures ?? {})));
    await Promise.all([...textures].map(fetchFile));
    const blobs = new Map<string, string>();
    for (const [path, data] of bytes) if (manifest.files[path]!.mime !== "application/json") {
      blobs.set(path, URL.createObjectURL(new Blob([data], { type: manifest.files[path]!.mime })));
    }
    const resolve = (path: string): string => {
      const relative = new URL(path, base).href.slice(base.length);
      const pinned = blobs.get(relative);
      if (pinned) return pinned;
      if (!bytes.has(relative)) throw new Error(`UI resource is outside the verified closure: ${path}`);
      const document = json(relative);
      if (typeof document.texture === "string") document.texture = resolve(new URL(document.texture, document.textureBase === "metrics" ? new URL(relative, base) : base).href);
      const result = URL.createObjectURL(new Blob([JSON.stringify(document)], { type: "application/json" }));
      blobs.set(relative, result);
      return result;
    };
    for (const pack of packs.values()) pack.resources.textures = Object.fromEntries(Object.entries(pack.resources.textures ?? {}).map(([id, path]) => [id, resolve(path)]));
    const binding = json(manifest.bindingSources.file) as { catalogs: Record<string, unknown> };
    if (!binding.catalogs) throw new Error("UI binding catalogs are missing");
    const catalogs = Object.values(binding.catalogs);
    if (catalogs.some(catalog => !catalog || typeof catalog !== "object" || Array.isArray(catalog))) throw new Error("Invalid UI binding catalog");
    const sprites = json(manifest.spriteGeometries.file) as { schema: string; region: string; client: NativeUiManifest["client"]; sprites: NativeUiLibrary["spriteGeometries"] };
    if (sprites.schema !== "nnnotes.observed-sprite-geometries/1" || sprites.region !== manifest.region
      || sprites.client?.versionName !== manifest.client.versionName || sprites.client?.versionCode !== manifest.client.versionCode || !sprites.sprites) {
      throw new Error("Dynamic Sprite source identity differs");
    }
    for (const key of Object.keys(manifest.spriteBitmaps ?? {})) {
      if (!Object.hasOwn(sprites.sprites, key) || !sprites.sprites[key]?.geometry) throw new Error(`Sprite bitmap has no source geometry: ${key}`);
    }
    const cameraSource = manifest.layout.sourceCamera, cameraPack = json(cameraSource.file) as UIPack;
    const component = (path: string, name: string): Record<string, unknown> => {
      const nodes = cameraPack.document?.nodes?.filter(node => node.path === path);
      const components = nodes?.length === 1 && Array.isArray(nodes[0]?.components)
        ? nodes[0]!.components.filter((component: Record<string, unknown>) => (component.class ?? component.type) === name) : [];
      if (components.length !== 1) throw new Error("Camera component is missing or ambiguous in its source");
      return components[0]!;
    };
    const scaler = component(cameraSource.canvasPath, "CanvasScaler");
    const resolution = scaler.m_ReferenceResolution as { x: number; y: number } | undefined;
    if (!resolution || resolution.x !== cameraSource.referenceViewport?.[0] || resolution.y !== cameraSource.referenceViewport?.[1]) throw new Error("Camera reference resolution differs from its CanvasScaler");
    const camera = { camera: component(cameraSource.cameraPath, "Camera"), canvas: component(cameraSource.canvasPath, "Canvas"), referenceViewport: cameraSource.referenceViewport };
    return { manifest, pack: (entry: NativeUiEntry) => structuredClone(packs.get(entry)!), catalogs: catalogs as NativeCardCatalog[], spriteGeometries: sprites.sprites, camera, assetBase: base,
      spriteUrl: createNativeSpriteLoader(manifest.dynamicSprites ?? manifest.spriteBitmaps ?? {}, base, manifest.spriteBitmaps !== undefined) };
  })().catch(error => { libraries.delete(key); throw error; }));
  return libraries.get(key)!;
}

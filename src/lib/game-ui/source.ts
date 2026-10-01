import type { GameServer } from "@/config/servers";
import type { UIPack } from "ournotes-player/ui";
import type { NativeCardCatalog, NativeSpriteGeometry } from "./card-fixture";
import { fetchNativeUiResource } from "./client";

export type NativeUiEntry = "formationSlot" | "memberSquare" | "supportSquare" | "formationGroup";
interface FileRecord { file?: string; sha256: string; size: number; mime: string }
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
  layout: NativeFormationLayout;
}
export interface NativeUiLibrary {
  manifest: NativeUiManifest;
  pack: (entry: NativeUiEntry) => UIPack;
  catalogs: NativeCardCatalog[];
  spriteGeometries: Readonly<Record<string, { geometry: NativeSpriteGeometry }>>;
  camera: { camera: Record<string, unknown>; canvas: Record<string, unknown>; referenceViewport: [number, number] };
  assetBase: string;
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

/** Verify the exported closure once, then render only these pinned bytes through the companion player. */
export function loadNativeUiLibrary(url: string, region: GameServer): Promise<NativeUiLibrary> {
  const key = `${region}:${url}`;
  if (!libraries.has(key)) libraries.set(key, (async () => {
    if (!url) throw new Error("UI library is not configured");
    const base = new URL(".", url).href;
    const response = await fetchNativeUiResource(url);
    const manifest = validateNativeUiManifest(await response.json(), region);
    const bytes = new Map<string, ArrayBuffer>();
    await Promise.all(Object.entries(manifest.files).map(async ([path, record]) => {
      const response = await fetchNativeUiResource(new URL(path, base));
      const data = await response.arrayBuffer();
      if (data.byteLength !== record.size || await digest(data) !== record.sha256) throw new Error(`UI resource content differs: ${path}`);
      bytes.set(path, data);
    }));
    const json = (path: string) => JSON.parse(new TextDecoder().decode(bytes.get(path)));
    const blobs = new Map<string, string>();
    for (const [path, record] of Object.entries(manifest.files)) if (record.mime !== "application/json") {
      blobs.set(path, URL.createObjectURL(new Blob([bytes.get(path)!], { type: record.mime })));
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
    const packs = new Map<NativeUiEntry, UIPack>();
    for (const [name, entry] of Object.entries(manifest.entries)) {
      const pack = json(entry.file) as UIPack;
      if (!Array.isArray(pack.document?.nodes) || !pack.resources) throw new Error("UI prefab has no serialized nodes");
      for (const type of ["textures", "fonts"] as const) pack.resources[type] = Object.fromEntries(Object.entries(pack.resources[type] ?? {}).map(([id, path]) => [id, resolve(path)]));
      pack.resources.fontMetrics = resolve(pack.resources.fontMetrics || "fonts/vibemo.json");
      if (pack.resources.fontMetricsByAsset) pack.resources.fontMetricsByAsset = Object.fromEntries(Object.entries(pack.resources.fontMetricsByAsset as Record<string, string>).map(([id, path]) => [id, resolve(path)]));
      packs.set(name as NativeUiEntry, pack);
    }
    const binding = json(manifest.bindingSources.file) as { catalogs: Record<string, unknown> };
    if (!binding.catalogs) throw new Error("UI binding catalogs are missing");
    const catalogs = Object.values(binding.catalogs);
    if (catalogs.some(catalog => !catalog || typeof catalog !== "object" || Array.isArray(catalog))) throw new Error("Invalid UI binding catalog");
    const sprites = json(manifest.spriteGeometries.file) as { schema: string; region: string; client: NativeUiManifest["client"]; sprites: NativeUiLibrary["spriteGeometries"] };
    if (sprites.schema !== "nnnotes.observed-sprite-geometries/1" || sprites.region !== manifest.region
      || sprites.client?.versionName !== manifest.client.versionName || sprites.client?.versionCode !== manifest.client.versionCode || !sprites.sprites) {
      throw new Error("Dynamic Sprite source identity differs");
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
    return { manifest, pack: (entry: NativeUiEntry) => structuredClone(packs.get(entry)!), catalogs: catalogs as NativeCardCatalog[], spriteGeometries: sprites.sprites, camera, assetBase: base };
  })().catch(error => { libraries.delete(key); throw error; }));
  return libraries.get(key)!;
}

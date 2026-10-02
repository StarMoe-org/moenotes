import { expect, spyOn, test } from "bun:test";
import { loadNativeUiLibrary, validateNativeUiManifest, type NativeUiManifest } from "../src/lib/game-ui/source";

function manifest(): NativeUiManifest {
  const file = { sha256: "a".repeat(64), size: 100, mime: "application/json" };
  return { schema: "moenotes.game-ui-library/1", region: "tw", client: { versionName: "1.0.1", versionCode: 25 },
    index: { file: "index.json", ...file }, bindingSources: { file: "bindings.json", ...file },
    spriteGeometries: { file: "sprites.json", ...file },
    entries: Object.fromEntries(["formationSlot", "memberSquare", "supportSquare", "formationGroup"].map(name => [name, { id: name, file: `${name}.json` }])) as NativeUiManifest["entries"],
    files: Object.fromEntries(["index", "bindings", "sprites", "camera", "formationSlot", "memberSquare", "supportSquare", "formationGroup"].map(name => [`${name}.json`, { ...file }])),
    layout: { schema: "moenotes.game-ui-formation-layout/1", sourcePack: { file: "formationGroup.json", ...file }, rootPath: "Formation", rootRect: { x: 0, y: 0, width: 1920, height: 1080 }, leaderSlot: 2,
      sourceCamera: { file: "camera.json", ...file, cameraPath: "Camera", canvasPath: "Canvas", referenceViewport: [1920, 1080] },
      slots: Array.from({ length: 5 }, (_, slotIndex) => ({ slotIndex, slotPath: `Formation/Slot${slotIndex}`, memberPath: `Formation/Slot${slotIndex}/Member`, supportPath: `Formation/Slot${slotIndex}/Support`, targetMemberRect: { x: slotIndex * 332, y: 200, width: 332, height: 600 },
        targetSupportRect: { x: slotIndex * 332 + 46, y: 583.5, width: 240, height: 135 } })) } };
}

test("a UI manifest binds click layout to the same formation pack and region", () => {
  const source = manifest();
  expect(validateNativeUiManifest(source, "tw")).toBe(source);
  expect(() => validateNativeUiManifest(source, "jp")).toThrow("source identity");
  source.layout.sourcePack.sha256 = "b".repeat(64);
  expect(() => validateNativeUiManifest(source, "tw")).toThrow("formation layout");
});

test("incomplete closure and traversal paths cannot substitute other UI resources", () => {
  const source = manifest(); delete source.files["supportSquare.json"];
  expect(() => validateNativeUiManifest(source, "tw")).toThrow("missing from its source");
  const escaped = manifest(); escaped.files["../textures/other.png"] = { sha256: "b".repeat(64), size: 50, mime: "image/png" };
  expect(() => validateNativeUiManifest(escaped, "tw")).toThrow("Invalid UI library resource");
  const mismatched = manifest(); mismatched.bindingSources.size++;
  expect(() => validateNativeUiManifest(mismatched, "tw")).toThrow("index identity");
});

test("click regions cannot silently reorder, duplicate or invalidate original slots", () => {
  const moved = manifest(); moved.layout.slots.reverse();
  expect(() => validateNativeUiManifest(moved, "tw")).toThrow("formation layout");
  const duplicate = manifest(); duplicate.layout.slots[1]!.slotPath = duplicate.layout.slots[0]!.slotPath;
  expect(() => validateNativeUiManifest(duplicate, "tw")).toThrow("formation layout");
  const invalid = manifest(); invalid.layout.slots[0]!.targetSupportRect.width = 0;
  expect(() => validateNativeUiManifest(invalid, "tw")).toThrow("formation layout");
});

test("legacy UI manifests load painted resources without fetching native font files or SDF atlases", async () => {
  const source = manifest();
  const pack = { document: { nodes: [{ path: "Formation", components: [{ class: "RawImage", m_Texture: { textureRef: "raw" } },
    { class: "TextMeshProUGUI", m_text: "LEADER", m_fontAsset: { name: "VibeMOPro-Medium SDF" } }] }] },
    resources: { textures: { frame: "textures/frame.png", raw: "textures/raw.png", font: "textures/font-atlas.png" },
      sprites: { frame: { textureRef: "frame" } }, fonts: { FZLTH: "fonts/native.ttf" }, fontMetrics: "fonts/vibemo.json" } };
  const documents: Record<string, unknown> = Object.fromEntries(Object.values(source.entries).map(entry => [entry.file, pack]));
  documents["index.json"] = {};
  documents["bindings.json"] = { catalogs: {} };
  documents["sprites.json"] = { schema: "nnnotes.observed-sprite-geometries/1", region: "tw", client: source.client, sprites: {} };
  documents["camera.json"] = { document: { nodes: [
    { path: "Camera", components: [{ class: "Camera" }] },
    { path: "Canvas", components: [{ class: "Canvas" }, { class: "CanvasScaler", m_ReferenceResolution: { x: 1920, y: 1080 } }] },
  ] } };
  documents["fonts/vibemo.json"] = { texture: "textures/font-atlas.png" };
  const payload = new Map(Object.entries(documents).map(([path, value]) => [path, new TextEncoder().encode(JSON.stringify(value))]));
  for (const path of ["textures/frame.png", "textures/raw.png", "textures/font-atlas.png", "fonts/native.ttf"]) payload.set(path, new Uint8Array([1, 2, 3]));
  source.files = {};
  for (const [path, data] of payload) source.files[path] = { size: data.length, mime: path.endsWith(".json") ? "application/json" : "application/octet-stream",
    sha256: [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map(value => value.toString(16).padStart(2, "0")).join("") };
  for (const record of [source.index, source.bindingSources, source.spriteGeometries, source.layout.sourcePack, source.layout.sourceCamera]) Object.assign(record, source.files[record.file]);
  const requested: string[] = [];
  const fetcher = spyOn(globalThis, "fetch").mockImplementation(async input => {
    const path = new URL(String(input)).pathname.replace("/website-font/", ""); requested.push(path);
    if (path === "manifest.json") return Response.json(source);
    const bytes = payload.get(path); return bytes ? new Response(bytes) : new Response(null, { status: 404 });
  });
  try {
    const loaded = await loadNativeUiLibrary("https://example.invalid/website-font/manifest.json", "tw");
    expect(requested).toContain("textures/frame.png");
    expect(requested).toContain("textures/raw.png");
    expect(requested).not.toContain("textures/font-atlas.png");
    expect(requested).not.toContain("fonts/native.ttf");
    expect(requested).not.toContain("fonts/vibemo.json");
    expect(loaded.pack("formationGroup").resources.browserFontFamily).toBe("sans-serif");
    expect(loaded.pack("formationGroup").document.nodes![0]!.components[1].m_text).toBe("LEADER");
  } finally { fetcher.mockRestore(); }
});

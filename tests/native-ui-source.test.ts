import { expect, test } from "bun:test";
import { validateNativeUiManifest, type NativeUiManifest } from "../src/lib/game-ui/source";

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

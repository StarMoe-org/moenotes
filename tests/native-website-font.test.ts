import { expect, test } from "bun:test";
import { withWebsiteUiFont } from "../src/lib/game-ui/website-font";
import { loadFonts } from "../node_modules/ournotes-player/src/ui/renderer.js";

test("website text keeps shared Sprite and RawImage textures and leaves the source pack unchanged", () => {
  const pack = { document: { nodes: [{ path: "Root", components: [
    { class: "TextMeshProUGUI", m_text: "LEADER", m_fontAsset: { name: "VibeMOPro-Medium SDF" } },
    { class: "RawImage", m_Texture: { textureRef: "raw" } },
  ] }] }, resources: { textures: { shared: "textures/shared.png", raw: "textures/raw.png", unused: "textures/font-only.png" },
    sprites: { icon: { textureRef: "shared" } }, fonts: { FZLTH: "fonts/native.ttf" }, fontMetrics: "fonts/metrics.json",
    fontMetricsByAsset: { VibeMO: "fonts/vibemo.json" } } };
  const before = structuredClone(pack), derived = withWebsiteUiFont(pack, '"Inter", system-ui, sans-serif');
  expect(pack).toEqual(before);
  expect(derived.document).toEqual(pack.document);
  expect(derived.resources.sprites).toEqual(pack.resources.sprites);
  expect(derived.resources.textures).toEqual({ shared: "textures/shared.png", raw: "textures/raw.png" });
  expect(derived.resources.fonts).toBeUndefined();
  expect(derived.resources.fontMetrics).toBeUndefined();
  expect(derived.resources.fontMetricsByAsset).toBeUndefined();
});

test("the shipped player uses the website font without resolving native font or SDF URLs", async () => {
  const family = '"Inter", system-ui, sans-serif';
  const result = await loadFonts({ document: { nodes: [{ components: [{ class: "TextMeshProUGUI", m_fontAsset: { name: "VibeMOPro-Medium SDF" } }] }] },
    resources: { browserFontFamily: family, fonts: { FZLTH: "native.ttf" }, fontMetrics: "vibemo.json" } },
    () => { throw new Error("Native font URL must not be resolved"); });
  expect(result.fontFamily).toBe(family);
  expect(result.gameFonts.size).toBe(0);
});

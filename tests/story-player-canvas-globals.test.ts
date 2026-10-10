import { expect, test } from "bun:test";
import { UIDraw } from "../node_modules/ournotes-player/src/engine/ugui.js";
import { ChatCanvasGL } from "../node_modules/ournotes-player/src/story/ui-chat.js";

// The ournotes-player patch gives uGUI draws what the engine sets outside the canvas; a URP 2D Shader Graph on an Image
// (Graphs_UIGrayscale of the Ave Mujica anime stills) reads it, and without it the story stops (issue #33).
const SPRITE_GLOBALS = { _RendererColor: [1, 1, 1, 1], unity_SpriteColor: [1, 1, 1, 1], unity_SpriteProps: [1, 1, 0, 0], _GlobalMipBias: [0, 1] };

test("story canvases and the story UI have the engine values sprite shader graphs read", () => {
  expect(UIDraw.globals(2340, 1080, 1300, 600, 4)).toMatchObject(SPRITE_GLOBALS);
  expect(ChatCanvasGL.globals(2340, 1080, 1300, 600, { fov: 30, near: 0.3, far: 1000, distance: 10 })).toMatchObject(SPRITE_GLOBALS);
});

test("each draw gets its own engine value arrays", () => {
  const a = UIDraw.globals(2340, 1080, 1300, 600, 4), b = UIDraw.globals(2340, 1080, 1300, 600, 4);
  expect(a._RendererColor).not.toBe(b._RendererColor);
  expect(a.unity_SpriteProps).not.toBe(b.unity_SpriteProps);
});

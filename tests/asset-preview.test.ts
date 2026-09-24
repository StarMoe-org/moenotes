import { expect, test } from "bun:test";
import { getAssetBrowserPreview } from "../src/lib/assets/preview";

test("resolves image preview for AddressableResources path", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Band/1/band_arena_background.png", "zh-CN");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("image");
  expect(result?.url).toBe("https://assets.bdon.moe/zh-Hans/Band/1/band_arena_background/band_arena_background.webp");
});

test("returns null for non-exported or unmapped path", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Unknown/not_exist.bytes", "zh-CN");
  expect(result).toBeNull();
});

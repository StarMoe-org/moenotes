import { expect, test } from "bun:test";
import { createNativeSpriteLoader, resolveNativeSpriteKey, type NativeDynamicSprites, type NativeUiManifest } from "../src/lib/game-ui/source";
import { bindNativeSprites } from "../src/lib/game-ui/sprite-binding";
import type { NativeFormationFixtureData } from "../src/lib/game-ui/formation-fixture";

const bytes = new Uint8Array([1, 2, 3, 4]);
const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
const sprites: NativeDynamicSprites = {
  "MemberCard/1/member_thumbnail[square]": { file: "sprites/card.webp", sha256, size: bytes.length, mime: "image/webp" },
  "MemberCard/1/member_character[formation]": { file: "sprites/character.webp", sha256, size: bytes.length, mime: "image/webp" },
  "MemberCard/2/member_thumbnail[square]": { file: "sprites/unused.webp", sha256, size: bytes.length, mime: "image/webp" },
  "Band/1/band_logo_white[Actual_decoded_name]": { file: "sprites/logo.webp", sha256, size: bytes.length, mime: "image/webp" },
};

test("only requested Sprite bytes are checked, and concurrent requests share one verified blob", async () => {
  const original = globalThis.fetch, calls: string[] = [];
  globalThis.fetch = (async input => { calls.push(String(input)); return new Response(bytes); }) as typeof fetch;
  let blob: string | undefined;
  try {
    const loader = createNativeSpriteLoader(sprites, "https://example.invalid/library/");
    expect(calls).toEqual([]);
    const urls = await Promise.all([loader("MemberCard/1/member_thumbnail[square]"), loader("MemberCard/1/member_thumbnail")]);
    blob = urls[0];
    expect(urls[1]).toBe(urls[0]); expect(blob?.startsWith("blob:")).toBe(true);
    expect(calls).toEqual(["https://example.invalid/library/sprites/card.webp"]);
    expect(() => loader("MemberCard/99/member_thumbnail[square]")).toThrow("missing or ambiguous");
    expect(calls).toHaveLength(1);
  } finally { globalThis.fetch = original; if (blob) URL.revokeObjectURL(blob); }
});

test("mismatched bytes never become image URLs and a failed request can retry", async () => {
  const original = globalThis.fetch;
  let calls = 0, blob: string | undefined;
  globalThis.fetch = (async () => new Response(++calls === 1 ? new Uint8Array([4, 3, 2, 1]) : bytes)) as typeof fetch;
  try {
    const loader = createNativeSpriteLoader(sprites, "https://example.invalid/library/");
    await expect(loader("MemberCard/1/member_thumbnail[square]")).rejects.toThrow("content differs");
    blob = await loader("MemberCard/1/member_thumbnail[square]");
    expect(calls).toBe(2); expect(blob.startsWith("blob:")).toBe(true);
  } finally { globalThis.fetch = original; if (blob) URL.revokeObjectURL(blob); }
});

test("an asset key with multiple actual Sprite names is not guessed", () => {
  const ambiguous = { ...sprites, "MemberCard/1/member_thumbnail[full]": sprites["MemberCard/1/member_thumbnail[square]"]! };
  expect(() => resolveNativeSpriteKey(ambiguous, "MemberCard/1/member_thumbnail")).toThrow("ambiguous");
  expect(resolveNativeSpriteKey(ambiguous, "MemberCard/1/member_thumbnail[square]")).toBe("MemberCard/1/member_thumbnail[square]");
});

test("configured fixture artwork uses verified blobs and preserves immutable facts", async () => {
  const requested: string[] = [];
  const source = { manifest: { dynamicSprites: sprites } as NativeUiManifest, spriteUrl: async (key: string) => { requested.push(key); return `blob:${key}`; } };
  const data: NativeFormationFixtureData = { slots: [{ member: { rarity: 4, cardType: 2, rank: 2,
    thumbnailUrl: "/unbound-release.webp", thumbnailSpriteKey: "MemberCard/1/member_thumbnail[square]",
    bandLogoUrl: "/unbound-logo.webp", bandLogoSpriteKey: "Band/1/band_logo_white" } }, {}, {}, {}, {}] };
  const bound = await bindNativeSprites(source, data);
  expect(requested).toEqual(["MemberCard/1/member_thumbnail[square]", "Band/1/band_logo_white[Actual_decoded_name]"]);
  expect(bound.slots[0]?.member?.thumbnailUrl).toBe("blob:MemberCard/1/member_thumbnail[square]");
  expect(bound.slots[0]?.member?.rank).toBe(2); expect(bound.slots[0]?.member?.level).toBeUndefined();
  expect(bound.slots[0]?.member?.bandLogoSpriteKey).toBe("Band/1/band_logo_white[Actual_decoded_name]");
  expect(data.slots[0]?.member?.thumbnailUrl).toBe("/unbound-release.webp");
  await expect(bindNativeSprites(source, { leader: false, member: { rarity: 4, cardType: 2, thumbnailUrl: "/unbound-release.webp" } })).rejects.toThrow("no source Sprite key");
  const legacy = { ...source, manifest: {} as NativeUiManifest };
  expect(await bindNativeSprites(legacy, data)).toBe(data);
});

test("sparse authoritative bitmaps bind only declared exact keys without changing published artwork", async () => {
  const key = "MemberCard/1/member_character[formation]", requested: string[] = [];
  const source = { manifest: { spriteBitmaps: { [key]: sprites[key]! } } as NativeUiManifest,
    spriteUrl: async (key: string) => { requested.push(key); return `blob:${key}`; } };
  const data: NativeFormationFixtureData = { slots: [{ member: { rarity: 20, cardType: 2, rank: 3,
    characterUrl: "/published-character.png", characterSpriteKey: key,
    backgroundUrl: "/published-background.png", backgroundSpriteKey: "MemberCard/1/member_background[formation]",
    bandLogoUrl: "/published-logo.png", bandLogoSpriteKey: "Band/1/band_logo_white[band_logo_white]" },
    support: { rarity: 10, cardType: 1, thumbnailUrl: "/published-snap.png", thumbnailSpriteKey: "SupportCard/70/snap_thumbnail[snap_thumbnail]" } }, {}, {}, {}, {}] };
  const bound = await bindNativeSprites(source, data);
  expect(requested).toEqual([key]);
  expect(bound.slots[0]?.member?.characterUrl).toBe(`blob:${key}`);
  expect(bound.slots[0]?.member?.backgroundUrl).toBe("/published-background.png");
  expect(bound.slots[0]?.member?.bandLogoUrl).toBe("/published-logo.png");
  expect(bound.slots[0]?.support).toBe(data.slots[0]?.support);
  expect(bound.slots[0]?.member?.rank).toBe(3);
  expect(bound.slots[0]?.member?.rarity).toBe(20);
  expect(data.slots[0]?.member?.characterUrl).toBe("/published-character.png");
  await expect(bindNativeSprites(source, { leader: false, member: { rarity: 4, cardType: 1,
    characterUrl: "/published-character.png", characterSpriteKey: "MemberCard/1/member_character" } })).rejects.toThrow("exact Sprite key");
  await expect(bindNativeSprites({ ...source, spriteUrl: async () => { throw new Error("declared source corrupt"); } }, data)).rejects.toThrow("declared source corrupt");
});

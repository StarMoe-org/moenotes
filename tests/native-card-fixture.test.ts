import { describe, expect, test } from "bun:test";
import { createNativeCardFixture } from "../src/lib/game-ui/card-fixture";

// Synthetic serialized references: no game assets or exported game data.
const ref = (id: string) => ({ nodeId: id, gameObject: `Card/${id}` });
const node = (id: string, components: Record<string, unknown>[] = []) => ({
  nodeId: id, path: `Card/${id}`, active: true, rect: { m_SizeDelta: { x: 160, y: 160 } }, components,
});
const gradients = {
  asset: "FrameAsset", name: "FrameCatalog",
  _gradientsByKey: { _list: [{ Key: 4, Value: { m_NumColorKeys: 2 } }] },
};
const types = {
  asset: "TypeAsset", name: "TypeCatalog",
  _spritesByKey: { _list: [{ Key: 2, Value: { spriteRef: "type-sprite" } }] },
};
function square(support = false) {
  const view: Record<string, unknown> = {
    class: support ? "UISupportCard" : "UIMemberCard",
    _cardRoot: ref("card"), _emptyRoot: ref("empty"), _selected: ref("selected"),
    _lvGroup: ref("levels"), _lvValueText: ref("levelText"), _statusGroup: ref("status"),
    _trainingGroup: ref("training"), _cardRankIcon: ref("rank"), _frame: ref("frame"),
    _cardTypeIcon: ref("type"), _thumbnailAddrImage: ref("art"),
  };
  return {
    document: { nodes: [
      node("root", [view]), node("card"), node("empty"), node("selected"), node("levels"),
      node("levelText", [{ class: "TextMeshProUGUI", m_text: "999" }]), node("status"), node("training"),
      node("rank", [{ class: "UIChangeableByIntImage", _key: 5,
        _spriteMap: { _list: [{ Key: 0, Value: { spriteRef: "rank-sprite" } }] } }]),
      node("frame", [{ class: "FormationFrame", _key: 4, _gradientCatalog: { asset: "FrameAsset", name: "FrameCatalog" } }]),
      node("type", [{ class: "UICardTypeIcon", _key: 2, _spriteCatalog: { asset: "TypeAsset", name: "TypeCatalog" },
        _enabledLinkBonus: 1, _enabledTypeBonus: 1, _linkBonusIcon: ref("link"),
        _glowsByCardType: { _list: [{ Key: 2, Value: ref("glow") }] } }]),
      node("art", [{ class: "UIAddressableImage", _image: ref("image"), _aspectRatioFitter: ref("aspect"), _loadingGameObject: ref("loading") },
        { type: "CanvasGroup", m_Alpha: 0 }]),
      node("image", [{ class: "Image" }]), node("loading"), node("link"), node("glow"),
      node("aspect", [{ class: "AspectRatioFitter", m_AspectMode: 0 }]),
    ] },
    resources: {
      sprites: { "type-sprite": { textureRef: "atlas" }, "rank-sprite": { textureRef: "atlas" } },
      textures: { atlas: "textures/synthetic.png" },
    },
  };
}
const member = { rarity: 4, cardType: 2, thumbnailUrl: "/member.webp" };
const catalogs = [gradients, types];
const patch = (fixture: ReturnType<typeof createNativeCardFixture>, node: string, field: string) =>
  fixture.patches.find(p => p.node === node && p.field === field);

describe("nnnotes card fixture bindings", () => {
  test("unselected views expose their actual empty roots and hide invented level/rank", () => {
    const pack = square(), original = structuredClone(pack);
    const fixture = createNativeCardFixture(pack, { leader: false });
    expect(patch(fixture, "card", "active")?.value).toBe(false);
    expect(patch(fixture, "empty", "active")?.value).toBe(true);
    expect(patch(fixture, "levels", "active")?.value).toBe(false);
    expect(patch(fixture, "rank", "active")?.value).toBe(false);
    expect(fixture.patches.some(p => p.field === "rect" || p.field.includes("m_SizeDelta"))).toBe(false);
    expect(pack).toEqual(original);
  });

  test("binds original catalog records, metadata and addressable images without mutating the pack", () => {
    const pack = square(), original = structuredClone(pack);
    const fixture = createNativeCardFixture(pack, { member, leader: false, catalogs });
    expect(patch(fixture, "frame", "_gradientCatalog")?.value).toEqual(gradients);
    expect(patch(fixture, "type", "_spriteCatalog")?.value).toEqual(types);
    expect(patch(fixture, "frame", "_key")?.value).toBe(4);
    expect(patch(fixture, "type", "_key")?.value).toBe(2);
    expect(patch(fixture, "image", "_previewSource")?.value).toBe("/member.webp");
    expect(patch(fixture, "loading", "active")?.value).toBe(false);
    expect(patch(fixture, "art", "m_Alpha")?.value).toBe(1);
    expect(patch(fixture, "link", "active")?.value).toBe(false);
    expect(patch(fixture, "glow", "active")?.value).toBe(false);
    expect(pack).toEqual(original);
  });

  test("only supplied level/rank values are shown, preserving a real zero rank", () => {
    const fixture = createNativeCardFixture(square(), {
      member: { ...member, level: 57, rank: 0 }, leader: false, catalogs,
    });
    expect(patch(fixture, "levels", "active")?.value).toBe(true);
    expect(patch(fixture, "rank", "active")?.value).toBe(true);
    expect(patch(fixture, "levelText", "m_text")?.value).toBe("57");
    expect(patch(fixture, "rank", "_key")?.value).toBe(0);
  });

  test("support data is bound to a support view and missing selected views are rejected", () => {
    const fixture = createNativeCardFixture(square(true), { support: member, leader: false, catalogs });
    expect(patch(fixture, "image", "_previewSource")?.value).toBe("/member.webp");
    expect(patch(fixture, "aspect", "m_AspectMode")?.value).toBe(4);
    expect(fixture.patches.some(entry => entry.field === "m_PreserveAspect")).toBe(false);
    expect(() => createNativeCardFixture(square(), { support: member, leader: false, catalogs })).toThrow("no support view");
  });

  test("uses nodeId when paths are duplicated and rejects an ambiguous legacy reference", () => {
    const pack = square();
    pack.document.nodes.push({ ...node("duplicate"), path: "Card/card" });
    expect(patch(createNativeCardFixture(pack, { leader: false }), "card", "active")?.value).toBe(false);
    pack.document.nodes[0]!.components[0]!._cardRoot = { gameObject: "Card/card" };
    expect(() => createNativeCardFixture(pack, { leader: false })).toThrow("ambiguous member._cardRoot path");
  });

  test("does not silently keep initial keys when catalogs or resources are missing", () => {
    expect(() => createNativeCardFixture(square(), { member, leader: false })).toThrow("missing catalog mapping");
    expect(() => createNativeCardFixture(square(), { member: { ...member, rarity: 999 }, leader: false, catalogs })).toThrow("key 999");
    const pack = square();
    delete (pack.resources.textures as Record<string, unknown>).atlas;
    expect(() => createNativeCardFixture(pack, { member, leader: false, catalogs })).toThrow("texture resource");
  });

  test("rejects malformed packs, unresolved references and missing card image assets", () => {
    expect(() => createNativeCardFixture({}, { leader: false })).toThrow("pack requires");
    const noGeometry = square();
    delete (noGeometry.document.nodes[0]! as Record<string, unknown>).rect;
    expect(() => createNativeCardFixture(noGeometry, { leader: false })).toThrow("RectTransform size");
    const pack = square();
    pack.document.nodes[0]!.components[0]!._cardRoot = { nodeId: "not-present" };
    expect(() => createNativeCardFixture(pack, { leader: false })).toThrow("unresolved");
    expect(() => createNativeCardFixture(square(), { member: { rarity: 4, cardType: 2 }, leader: false, catalogs })).toThrow("image URL");
    expect(() => createNativeCardFixture(square(), { member: { ...member, thumbnailUrl: "javascript:alert(1)" }, leader: false, catalogs })).toThrow("protocol");
  });

  test("formation members require separate character/background layers and activate only the front view", () => {
    const pack = square(), view = pack.document.nodes[0]!.components[0]!;
    view.class = "UIFormationMemberCard";
    delete view._thumbnailAddrImage;
    view._frontContent = ref("front"); view._backContent = ref("back");
    view._frontThumbRoot = ref("frontThumb"); view._backThumbRoot = ref("backThumb");
    view._frontThumbnailAddrImage = ref("art"); view._frontBackgroundAddrImage = ref("background");
    view._backThumbnailAddrImage = ref("backArt"); view._backBackgroundAddrImage = ref("backBackground");
    view._leaderLabel = ref("leader");
    pack.document.nodes.push(node("front"), node("back"), node("frontThumb"), node("backThumb"), node("leader"),
      node("background", [{ class: "UIAddressableImage", _image: ref("backgroundImage") }]), node("backgroundImage", [{ class: "Image" }]),
      node("backArt", [{ class: "UIAddressableImage", _image: ref("backImage") }]), node("backImage", [{ class: "Image" }]),
      node("backBackground", [{ class: "UIAddressableImage", _image: ref("backBackgroundImage") }]), node("backBackgroundImage", [{ class: "Image" }]));
    expect(() => createNativeCardFixture(pack, { member, leader: false, catalogs })).toThrow("member.character");
    const fixture = createNativeCardFixture(pack, {
      member: { ...member, characterUrl: "/character.webp", backgroundUrl: "/background.webp" },
      leader: true, catalogs,
    });
    expect(patch(fixture, "image", "_previewSource")?.value).toBe("/character.webp");
    expect(patch(fixture, "backgroundImage", "_previewSource")?.value).toBe("/background.webp");
    expect(patch(fixture, "back", "active")?.value).toBe(false);
    expect(patch(fixture, "backThumb", "active")?.value).toBe(false);
    expect(patch(fixture, "leader", "active")?.value).toBe(true);
    const sr = createNativeCardFixture(pack, { member: { rarity: 3, cardType: 2, characterUrl: "/sr-character.webp", backgroundUrl: "/sr-background.webp" },
      leader: false, catalogs: [{ ...gradients, _gradientsByKey: { _list: [{ Key: 3, Value: { m_NumColorKeys: 2 } }] } }, types] });
    expect(patch(sr, "front", "active")?.value).toBe(true);
    expect(patch(sr, "back", "active")?.value).toBe(false);
    expect(patch(sr, "frontThumb", "active")?.value).toBe(false);
    expect(patch(sr, "backThumb", "active")?.value).toBe(true);
    expect(patch(sr, "backImage", "_previewSource")?.value).toBe("/sr-character.webp");
    expect(patch(sr, "image", "_previewSource")).toBeUndefined();
  });
});

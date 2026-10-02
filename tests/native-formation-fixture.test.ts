import { describe, expect, test } from "bun:test";
import { createNativeFormationFixture } from "../src/lib/game-ui/formation-fixture";

type RecordData = Record<string, unknown>;
const ref = (path: string) => ({ nodeId: path, gameObject: path });
const node = (path: string, components: RecordData[] = []) => ({
  nodeId: path, path, active: true, rect: { m_SizeDelta: { x: 332, y: 600 } }, components,
});
const keyed = (name: string) => ({ class: name, _key: 4,
  _gradientCatalog: { asset: "synthetic", name: "frame", _gradientsByKey: { _list: [{ Key: 4, Value: { m_NumColorKeys: 2 } }] } } });
const typeIcon = () => ({ class: "UICardTypeIcon", _key: 2,
  _spriteMap: { _list: [{ Key: 2, Value: { spriteRef: "type" } }] } });

function group() {
  const owner = "Formation", root = `${owner}/Root`;
  const slots = Array.from({ length: 5 }, (_, i) => `${root}/Slot${i}`);
  const nodes = [node(owner, [{ class: "UIFormationListItem", _slots: slots.map(ref) }]), node(root)];
  for (const path of slots) {
    const contents = `${path}/Contents`, member = `${contents}/Member`, support = `${contents}/Support`;
    const card = `${member}/Card`, front = `${card}/Front`, thumb = `${front}/FrontThumb`;
    nodes.push(node(path, [{ class: "UIFormationSlot", _contents: ref(contents), _memberCard: ref(member), _supportCard: ref(support) }]),
      node(contents), node(member, [{ class: "UIFormationMemberCard", _cardRoot: ref(card), _emptyRoot: ref(`${member}/Empty`),
        _frontContent: ref(front), _backContent: ref(`${card}/Back`), _frontThumbRoot: ref(thumb), _backThumbRoot: ref(`${front}/BackThumb`),
        _frame: ref(`${front}/Frame`), _cardTypeIcon: ref(`${front}/Type`),
        _frontThumbnailAddrImage: ref(`${thumb}/Character`), _frontBackgroundAddrImage: ref(`${thumb}/Background`),
        _leaderLabel: ref(`${member}/Leader`) }]),
      node(card), node(front), node(`${front}/Frame`, [keyed("UIMemberCardFormationFrame")]), node(`${front}/Type`, [typeIcon()]),
      node(thumb), node(`${thumb}/Character`, [{ class: "UIAddressableImage", _image: ref(`${thumb}/Character/Image`) }]),
      node(`${thumb}/Character/Image`, [{ class: "Image" }]),
      node(`${thumb}/Background`, [{ class: "UIAddressableImage", _image: ref(`${thumb}/Background/Image`) }]),
      node(`${thumb}/Background/Image`, [{ class: "Image" }]),
      node(`${front}/BackThumb`), node(`${card}/Back`), node(`${member}/Empty`), node(`${member}/Leader`),
      node(support, [{ class: "UIFormationSupportCard", _cardRoot: ref(`${support}/Card`), _emptyRoot: ref(`${support}/Empty`),
        _frame: ref(`${support}/Card/Frame`), _cardTypeIcon: ref(`${support}/Card/Type`), _thumbnailAddrImage: ref(`${support}/Card/Art`) }]),
      node(`${support}/Card`), node(`${support}/Card/Frame`, [keyed("UISupportCardFormationFrame")]), node(`${support}/Card/Type`, [typeIcon()]),
      node(`${support}/Card/Art`, [{ class: "UIAddressableImage", _image: ref(`${support}/Card/Art/Image`), _aspectRatioFitter: ref(`${support}/Card/Art`) },
        { class: "AspectRatioFitter", m_AspectMode: 0 }]),
      node(`${support}/Card/Art/Image`, [{ class: "Image" }]), node(`${support}/Empty`));
  }
  return { document: { nodes }, resources: { sprites: { type: { textureRef: "atlas" } }, textures: { atlas: "/synthetic.png" } } };
}
const data = () => ({ slots: Array.from({ length: 5 }, (_, i) => ({
  member: { rarity: 4, cardType: 2, characterUrl: `/character-${i}.webp`, backgroundUrl: `/background-${i}.webp` },
  support: { rarity: 4, cardType: 2, thumbnailUrl: `/snap-${i}.webp` },
})) });
const leaderPatches = (pack: ReturnType<typeof createNativeFormationFixture>) => pack.patches
  .filter(p => p.node.endsWith("/Member/Leader") && p.field === "active");

describe("the original five-slot formation prefab", () => {
  test("binds every original slot and marks only native slot 2 as leader without moving nodes", () => {
    const pack = group(), before = structuredClone(pack), fixture = createNativeFormationFixture(pack, data());
    expect(leaderPatches(fixture).map(p => p.value)).toEqual([false, false, true, false, false]);
    const portraits = fixture.patches.filter(p => p.field === "_previewSource" && p.node.endsWith("/Character/Image"));
    expect(portraits.map(p => p.value)).toEqual([0, 1, 2, 3, 4].map(i => `/character-${i}.webp`));
    expect(fixture.patches.some(p => /rect|Position|Rotation|Scale/.test(p.field))).toBe(false);
    expect(pack).toEqual(before);
  });

  test("PPtr order drives data binding rather than hierarchy order or inferred slot names", () => {
    const pack = group(), refs = pack.document.nodes[0]!.components[0]!._slots as RecordData[];
    [refs[0], refs[4]] = [refs[4]!, refs[0]!];
    const fixture = createNativeFormationFixture(pack, data());
    expect(fixture.patches.find(p => p.node === "Formation/Root/Slot4/Contents/Member/Card/Front/FrontThumb/Character/Image" && p.field === "_previewSource")?.value).toBe("/character-0.webp");
    expect(leaderPatches(fixture).find(p => p.value === true)?.node).toBe("Formation/Root/Slot2/Contents/Member/Leader");
  });

  test("five empty slots keep their native empty views and no leader portrait is invented", () => {
    const fixture = createNativeFormationFixture(group(), { slots: [{}, {}, {}, {}, {}] });
    expect(leaderPatches(fixture).every(p => p.value === false)).toBe(true);
    expect(fixture.patches.filter(p => p.node.endsWith("/Member/Empty") && p.field === "active").every(p => p.value === true)).toBe(true);
    expect(fixture.patches.some(p => p.field === "_previewSource")).toBe(false);
  });

  test("rejects missing, duplicated and unresolved slots instead of assigning data to a different card", () => {
    expect(() => createNativeFormationFixture(group(), { slots: [] })).toThrow("five slot data");
    const pack = group(), owner = pack.document.nodes[0]!.components[0]!;
    owner._slots = [ref("not-present"), ref("not-present"), ref("not-present"), ref("not-present"), ref("not-present")];
    expect(() => createNativeFormationFixture(pack, data())).toThrow("unresolved _slots[0]");
    owner._slots = Array.from({ length: 5 }, () => ref("Formation/Root/Slot0"));
    expect(() => createNativeFormationFixture(pack, data())).toThrow("duplicate slot references");
    owner._slots = [ref("Formation/Root/Slot0")];
    expect(() => createNativeFormationFixture(pack, data())).toThrow("five PPtrs");
  });

  test("rejects cross-slot card references and unsupported card components", () => {
    const pack = group(), slot = pack.document.nodes.find(n => n.path === "Formation/Root/Slot0")!;
    slot.components[0]!._memberCard = ref("Formation/Root/Slot1/Contents/Member");
    expect(() => createNativeFormationFixture(pack, data())).toThrow("outside its original slot subtree");
    const malformed = group(), member = malformed.document.nodes.find(n => n.path === "Formation/Root/Slot0/Contents/Member")!;
    member.components[0]!.class = "NotAFormationCard";
    expect(() => createNativeFormationFixture(malformed, data())).toThrow("UIFormationMemberCard");
  });

  test("duplicate names use stable IDs and preorder scope; duplicate stable IDs are rejected", () => {
    const pack = group(), oldPath = "Formation/Root/Slot4", duplicatePath = "Formation/Root/Slot0";
    for (const node of pack.document.nodes) if (node.path === oldPath || node.path.startsWith(`${oldPath}/`)) {
      node.path = node.path.replace(oldPath, duplicatePath);
    }
    const fixture = createNativeFormationFixture(pack, data());
    expect(fixture.patches.find(p => p.node === `${oldPath}/Contents/Member/Card/Front/FrontThumb/Character/Image` && p.field === "_previewSource")?.value).toBe("/character-4.webp");
    pack.document.nodes.at(-1)!.nodeId = pack.document.nodes[0]!.nodeId;
    expect(() => createNativeFormationFixture(pack, data())).toThrow("duplicate serialized nodeId");
  });

  test("a legacy ambiguous path is rejected rather than selecting the first matching instance", () => {
    const pack = group(), owner = pack.document.nodes[0]!.components[0]!;
    pack.document.nodes.push(node("Formation/Root/Slot0"));
    pack.document.nodes.at(-1)!.nodeId = "second-instance";
    const refs = owner._slots as RecordData[];
    refs[0] = { gameObject: "Formation/Root/Slot0" };
    expect(() => createNativeFormationFixture(pack, data())).toThrow("ambiguous _slots[0]");
  });
});

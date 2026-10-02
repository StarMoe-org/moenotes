import {
  createNativeCardFixture,
  type NativeCardCatalog,
  type NativeCardFixture,
  type NativeMemberCardData,
  type NativeSupportCardData,
  type NativeSpriteGeometry,
} from "./card-fixture";

export interface NativeFormationSlotData {
  member?: NativeMemberCardData | undefined;
  support?: NativeSupportCardData | undefined;
}

export interface NativeFormationFixtureData {
  slots: readonly NativeFormationSlotData[];
  catalogs?: readonly NativeCardCatalog[] | undefined;
  spriteGeometries?: Readonly<Record<string, { geometry: NativeSpriteGeometry }>> | undefined;
  hideSlotBackdrop?: boolean | undefined;
}

type SerializedRecord = Record<string, unknown>;
interface SerializedNode extends SerializedRecord {
  path: string;
  components: SerializedRecord[];
}
function fail(message: string): never { throw new Error(`Native formation fixture: ${message}`); }
function record(value: unknown): SerializedRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as SerializedRecord : undefined;
}
function component(node: SerializedNode, name: string): SerializedRecord {
  const matches = node.components.filter(c => (c.class ?? c.type) === name);
  if (matches.length !== 1) fail(`expected one ${name} on ${node.path}`);
  return matches[0]!;
}

/** Bind the original group in its serialized deck-slot order; native leader slot is 2. */
export function createNativeFormationFixture(pack: unknown, data: NativeFormationFixtureData): NativeCardFixture {
  const source = record(pack), document = record(source?.document), resources = record(source?.resources);
  if (!source || !document || !resources || !Array.isArray(document.nodes) || !document.nodes.length) {
    fail("pack requires nonempty document.nodes and resources");
  }
  if (!Array.isArray(data.slots) || data.slots.length !== 5) fail("exactly five slot data records are required");
  const nodes: SerializedNode[] = document.nodes.map((raw, index) => {
    const node = record(raw);
    if (!node || typeof node.path !== "string" || !node.path || !Array.isArray(node.components)) {
      fail(`invalid serialized node ${index}`);
    }
    const components = node.components.map(c => record(c) ?? fail(`invalid component on ${node.path}`));
    return { ...node, path: node.path, components };
  });
  const paths = new Map<string, number[]>(), ids = new Map<string, number>();
  for (const [index, node] of nodes.entries()) {
    paths.set(node.path, [...paths.get(node.path) ?? [], index]);
    if (typeof node.nodeId === "string" && node.nodeId) {
      if (ids.has(node.nodeId)) fail(`duplicate serialized nodeId ${node.nodeId}`);
      ids.set(node.nodeId, index);
    }
  }
  const resolve = (refValue: unknown, label: string): number => {
    const ref = record(refValue);
    if (!ref) fail(`missing ${label} PPtr`);
    if (typeof ref.nodeId === "string" && ref.nodeId) {
      const index = ids.get(ref.nodeId);
      if (index === undefined) fail(`unresolved ${label} nodeId ${ref.nodeId}`);
      return index;
    }
    if (typeof ref.gameObject !== "string") fail(`missing ${label} nodeId or gameObject path`);
    const matching = paths.get(ref.gameObject);
    if (!matching?.length) fail(`unresolved ${label} path ${ref.gameObject}`);
    if (matching.length !== 1) fail(`ambiguous ${label} path ${ref.gameObject}; nodeId is required`);
    return matching[0]!;
  };
  const owners = nodes.flatMap((node, index) => node.components
    .filter(c => c.class === "UIFormationListItem").map(view => ({ index, view })));
  if (owners.length !== 1) fail("pack must contain exactly one UIFormationListItem slot owner");
  const slotRefs = owners[0]!.view._slots;
  if (!Array.isArray(slotRefs) || slotRefs.length !== 5) fail("UIFormationListItem._slots must contain five PPtrs");
  const indices = slotRefs.map((ref, index) => resolve(ref, `_slots[${index}]`));
  if (new Set(indices).size !== 5) fail("UIFormationListItem._slots contains duplicate slot references");
  const patches: NativeCardFixture["patches"] = [];
  const ranges: Array<{ start: number; end: number }> = [];
  for (const [slotIndex, start] of indices.entries()) {
    const slot = nodes[start]!, view = component(slot, "UIFormationSlot"), depth = slot.path.split("/").length;
    let end = start + 1;
    while (end < nodes.length && nodes[end]!.path.split("/").length > depth) {
      if (!nodes[end]!.path.startsWith(`${slot.path}/`)) fail(`invalid preorder subtree for _slots[${slotIndex}]`);
      end++;
    }
    if (ranges.some(range => start < range.end && end > range.start)) fail("formation slot subtrees overlap");
    ranges.push({ start, end });
    const within = (ref: unknown, label: string): SerializedNode => {
      const index = resolve(ref, label);
      if (index <= start || index >= end) fail(`${label} points outside its original slot subtree`);
      return nodes[index]!;
    };
    within(view._contents, `_slots[${slotIndex}]._contents`);
    component(within(view._memberCard, `_slots[${slotIndex}]._memberCard`), "UIFormationMemberCard");
    component(within(view._supportCard, `_slots[${slotIndex}]._supportCard`), "UIFormationSupportCard");
    const slotData = data.slots[slotIndex];
    if (!record(slotData)) fail(`invalid slot data ${slotIndex}`);
    // Preserve names, node IDs, transform values, and every pack resource. The
    // subpack is only a reference scope for bindings; the caller renders pack.
    const subpack = { ...source, document: { ...document, nodes: document.nodes.slice(start, end) } };
    const fixture = createNativeCardFixture(subpack, {
      ...(slotData.member !== undefined ? { member: slotData.member } : {}),
      ...(slotData.support !== undefined ? { support: slotData.support } : {}),
      ...(data.catalogs !== undefined ? { catalogs: data.catalogs } : {}),
      ...(data.spriteGeometries !== undefined ? { spriteGeometries: data.spriteGeometries } : {}),
      ...(data.hideSlotBackdrop !== undefined ? { hideSlotBackdrop: data.hideSlotBackdrop } : {}),
      leader: slotIndex === 2,
    });
    patches.push(...fixture.patches);
  }
  return { patches };
}

/** App data bindings for nnnotes UI packs. Geometry and Sprite records stay in the pack. */
export interface NativeMemberCardData {
  rarity: number;
  cardType: number;
  thumbnailUrl?: string;
  characterUrl?: string;
  backgroundUrl?: string;
  bandLogoUrl?: string;
  characterSpriteKey?: string;
  backgroundSpriteKey?: string;
  thumbnailSpriteKey?: string;
  bandLogoSpriteKey?: string;
  level?: number;
  rank?: number;
}

export interface NativeSupportCardData {
  rarity: number;
  cardType: number;
  thumbnailUrl: string;
  thumbnailSpriteKey?: string;
  level?: number;
  rank?: number;
}

export interface NativeCardFixtureData {
  member?: NativeMemberCardData;
  support?: NativeSupportCardData;
  leader: boolean;
  /** Complete serialized catalog records from a verified, same-source nnnotes pack. */
  catalogs?: readonly NativeCardCatalog[];
  spriteGeometries?: Readonly<Record<string, { geometry: NativeSpriteGeometry }>> | undefined;
  /** Web presentation hides the slot's outer gray backdrop only when occupied. */
  hideSlotBackdrop?: boolean | undefined;
}

export interface NativeSpriteGeometry {
  rect: { x: number; y: number; width: number; height: number };
  textureRect: { x: number; y: number; width: number; height: number };
  textureRectOffset: { x: number; y: number };
  pixelsPerUnit: number;
}

export type NativeCardCatalog = Readonly<Record<string, unknown>>;

/** Passed directly to the public UIPlayer.applyFixture API. */
export interface NativeCardPatch {
  node: string;
  component: string | null;
  field: string;
  value: unknown;
}

export interface NativeCardFixture { patches: NativeCardPatch[] }

type SerializedRecord = Record<string, unknown>;
interface SerializedNode extends SerializedRecord {
  path: string;
  components: SerializedRecord[];
}

const MEMBER_CLASSES = new Set(["UIMemberCard", "UIFormationMemberCard"]);
const SUPPORT_CLASSES = new Set(["UISupportCard", "UIFormationSupportCard"]);
const record = (value: unknown): SerializedRecord | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as SerializedRecord : undefined;
const className = (component: SerializedRecord): string => {
  const value = component.class ?? component.type;
  return typeof value === "string" ? value : "";
};
function fail(message: string): never { throw new Error(`Native card fixture: ${message}`); }

function nonnegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a nonnegative integer`);
  return value;
}

function imageUrl(value: string | undefined, label: string): string {
  if (typeof value !== "string" || !value.trim()) fail(`missing ${label} image URL`);
  if (/^[a-z][a-z\d+.-]*:/i.test(value.trim())) {
    let url: URL;
    try { url = new URL(value); }
    catch { return fail(`invalid ${label} image URL`); }
    if (!["http:", "https:", "blob:"].includes(url.protocol)) fail(`invalid ${label} image protocol`);
  } else if (/^(?:\/\/|\\)/.test(value)) fail(`invalid ${label} image protocol`);
  return value;
}

/**
 * Supports one member and/or one support view, including UIFormationSlot and the
 * two square item prefabs. A formation member always uses separate character and
 * background assets. This function never substitutes a flattened thumbnail.
 */
export function createNativeCardFixture(pack: unknown, data: NativeCardFixtureData): NativeCardFixture {
  const source = record(pack), document = record(source?.document), resources = record(source?.resources);
  if (!document || !resources || !Array.isArray(document.nodes) || document.nodes.length === 0) {
    return fail("pack requires nonempty document.nodes and resources");
  }
  const nodes: SerializedNode[] = document.nodes.map((value, index) => {
    const node = record(value);
    if (!node || typeof node.path !== "string" || !node.path || !Array.isArray(node.components)) {
      return fail(`invalid serialized node ${index}`);
    }
    const components = node.components.map(value => record(value) ?? fail(`invalid component on ${node.path}`));
    return { ...node, path: node.path, components };
  });
  const paths = new Map<string, SerializedNode[]>(), ids = new Map<string, SerializedNode>();
  for (const node of nodes) {
    paths.set(node.path, [...paths.get(node.path) ?? [], node]);
    if (typeof node.nodeId === "string" && node.nodeId) {
      if (ids.has(node.nodeId)) fail(`duplicate serialized nodeId ${node.nodeId}`);
      ids.set(node.nodeId, node);
    }
  }
  const selector = (node: SerializedNode): string => {
    if (typeof node.nodeId === "string" && node.nodeId) return node.nodeId;
    if (paths.get(node.path)?.length !== 1) return fail(`ambiguous node path ${node.path}; nodeId is required`);
    return node.path;
  };
  const resolve = (reference: unknown, label: string, required = false): SerializedNode | undefined => {
    if (reference === null || reference === undefined) {
      if (required) fail(`missing ${label} reference`);
      return undefined;
    }
    const ref = record(reference);
    if (typeof ref?.nodeId === "string" && ref.nodeId) {
      return ids.get(ref.nodeId) ?? fail(`unresolved ${label} nodeId ${ref.nodeId}`);
    }
    const path = typeof reference === "string" ? reference : ref?.gameObject ?? ref?.transform;
    if (typeof path !== "string") return fail(`invalid ${label} reference`);
    const matching = paths.get(path);
    if (!matching?.length) return fail(`unresolved ${label} path ${path}`);
    if (matching.length !== 1) return fail(`ambiguous ${label} path ${path}; nodeId is required`);
    return matching[0];
  };
  const patches: NativeCardPatch[] = [];
  const patch = (node: SerializedNode, component: string | null, field: string, value: unknown): void => {
    patches.push({ node: selector(node), component, field, value });
  };
  const component = (node: SerializedNode, name: string): SerializedRecord => {
    const matching = node.components.filter(value => className(value) === name);
    if (matching.length !== 1) return fail(`expected one ${name} component on ${node.path}`);
    return matching[0]!;
  };
  const active = (ref: unknown, enabled: boolean, label: string, required = false): void => {
    const node = resolve(ref, label, required);
    if (node) patch(node, null, "active", enabled);
  };
  const show = (ref: unknown, label: string): SerializedNode => {
    const node = resolve(ref, label, true)!;
    patch(node, null, "active", true);
    const groups = node.components.filter(value => className(value) === "CanvasGroup");
    if (groups.length > 1) fail(`ambiguous CanvasGroup on ${node.path}`);
    if (groups.length) patch(node, "CanvasGroup", "m_Alpha", 1);
    return node;
  };
  const text = (ref: unknown, value: string, label: string): void => {
    const node = show(ref, label);
    component(node, "TextMeshProUGUI");
    patch(node, "TextMeshProUGUI", "m_text", value);
  };
  const art = (ref: unknown, value: string | undefined, label: string, spriteKey?: string, aspectMode?: number): void => {
    const url = imageUrl(value, label), node = show(ref, label);
    const address = component(node, "UIAddressableImage");
    if (aspectMode !== undefined) {
      const fitter = resolve(address._aspectRatioFitter, `${label}._aspectRatioFitter`, true)!;
      component(fitter, "AspectRatioFitter");
      patch(fitter, "AspectRatioFitter", "m_AspectMode", aspectMode);
    }
    const image = resolve(address._image, `${label}._image`, true)!;
    component(image, "Image");
    patch(image, null, "active", true);
    patch(image, "Image", "_previewSource", url);
    if (spriteKey && data.spriteGeometries) {
      const geometry = data.spriteGeometries[spriteKey]?.geometry;
      if (!geometry || ![geometry.rect?.width, geometry.rect?.height, geometry.textureRect?.width, geometry.textureRect?.height, geometry.pixelsPerUnit]
        .every(value => typeof value === "number" && Number.isFinite(value) && value > 0)
        || ![geometry.textureRectOffset?.x, geometry.textureRectOffset?.y].every(value => typeof value === "number" && Number.isFinite(value))) {
        fail(`missing or invalid observed Sprite geometry for ${spriteKey}`);
      }
      patch(image, "Image", "_previewSpriteGeometry", geometry);
    }
    active(address._loadingGameObject, false, `${label}._loadingGameObject`);
  };

  const catalogs = new Map<string, SerializedRecord>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    const item = record(value);
    if (!item) return;
    if (typeof item.asset === "string" && typeof item.name === "string"
      && (record(item._spritesByKey) || record(item._gradientsByKey))) {
      catalogs.set(`${item.asset}:${item.name}`, item);
    }
    Object.values(item).forEach(collect);
  };
  collect(document);
  collect(data.catalogs);
  const key = (ref: unknown, value: number, label: string): void => {
    nonnegativeInteger(value, label);
    const node = show(ref, label), hint = record(ref)?.class;
    const candidates = node.components.filter(c => typeof c._key === "number"
      && (hint === undefined || className(c) === hint));
    if (candidates.length !== 1) fail(`expected one keyed component for ${label} on ${node.path}`);
    const target = candidates[0]!, catRef = record(target._spriteCatalog ?? target._gradientCatalog);
    const catalog = catRef && catalogs.get(`${String(catRef.asset)}:${String(catRef.name)}`) || catRef;
    const mapping = record(target._spriteMap) ?? record(catalog?._spritesByKey) ?? record(catalog?._gradientsByKey);
    if (!Array.isArray(mapping?._list)) fail(`missing catalog mapping for ${label}`);
    const chosen = mapping._list.map(record).find(item => item?.Key === value);
    if (!chosen || !record(chosen.Value)) fail(`catalog has no ${label} key ${value}`);
    const spriteRef = record(chosen.Value)?.spriteRef;
    if (typeof spriteRef === "string") {
      const sprite = record(record(resources.sprites)?.[spriteRef]);
      if (!sprite) fail(`missing ${label} Sprite resource ${spriteRef}`);
      if (typeof sprite.textureRef !== "string" || typeof record(resources.textures)?.[sprite.textureRef] !== "string") {
        fail(`missing ${label} texture resource ${spriteRef}`);
      }
    }
    // A dependency root can retain just an asset/name reference. Inject the exact
    // exported catalog through applyFixture, rather than inventing its mapping.
    if (catRef && catalog !== catRef && !record(target._spriteMap)) {
      patch(node, className(target), target._spriteCatalog ? "_spriteCatalog" : "_gradientCatalog", catalog);
    }
    patch(node, className(target), "_key", value);
  };

  const cards = nodes.flatMap(node => node.components
    .filter(c => MEMBER_CLASSES.has(className(c)) || SUPPORT_CLASSES.has(className(c)))
    .map(view => ({ node, view, support: SUPPORT_CLASSES.has(className(view)) })));
  if (!cards.length) fail("pack has no supported member or support card component");
  for (const { node } of cards) {
    const size = record(record(node.rect)?.m_SizeDelta);
    if (!size || typeof size.x !== "number" || typeof size.y !== "number"
      || !Number.isFinite(size.x) || !Number.isFinite(size.y)) {
      fail(`card view has no serialized RectTransform size on ${node.path}`);
    }
  }
  for (const support of [false, true]) {
    const count = cards.filter(card => card.support === support).length;
    const label = support ? "support" : "member", selected = support ? data.support : data.member;
    if (count > 1) fail(`pack has multiple ${label} views; use a single-slot prefab`);
    if (selected && count === 0) fail(`pack has no ${label} view for supplied data`);
  }
  for (const { node: cardNode, view, support } of cards) {
    const card = support ? data.support : data.member, label = support ? "support" : "member";
    active(view._cardRoot, Boolean(card), `${label}._cardRoot`, true);
    active(view._emptyRoot, !card, `${label}._emptyRoot`, true);
    for (const field of ["_selected", "_highlightFrame", "_highlightFrameInEmpty", "_batch", "_eventBonusLabel", "_statusGroup", "_trainingGroup"]) {
      active(view[field], false, `${label}.${field}`);
    }
    active(view._leaderLabel, Boolean(card && !support && data.leader), `${label}._leaderLabel`);
    active(view._lvGroup, Boolean(card && card.level !== undefined), `${label}._lvGroup`);
    active(view._cardRankIcon, Boolean(card && card.rank !== undefined), `${label}._cardRankIcon`);
    active(view._levelText, Boolean(card && card.level !== undefined), `${label}._levelText`);
    if (!card) continue;
    if (!support && className(view) === "UIFormationMemberCard" && data.hideSlotBackdrop) {
      for (const [suffix, sprite] of [["Contents/Background", "WhiteRect"], ["Contents/Line3pxFrame/Outline", "FrameSquare_3px"]]) {
        const visual = resolve(`${cardNode.path}/${suffix}`, "slot backdrop", true)!;
        if (record(component(visual, "Image").m_Sprite)?.name !== sprite) fail("slot backdrop Sprite differs from its source");
        patch(visual, null, "active", false);
      }
    }
    key(view._frame, card.rarity, `${label}._frame`);
    key(view._cardTypeIcon, card.cardType, `${label}._cardTypeIcon`);
    if (card.rank !== undefined) key(view._cardRankIcon, card.rank, `${label}._cardRankIcon`);
    if (card.level !== undefined) {
      nonnegativeInteger(card.level, `${label}.level`);
      if (view._lvValueText) text(view._lvValueText, String(card.level), `${label}._lvValueText`);
      else text(view._levelText, `Lv.${card.level}`, `${label}._levelText`);
    }
    if (className(view) === "UIFormationMemberCard") {
      const member = data.member!;
      active(view._frontContent, true, "member._frontContent", true);
      active(view._backContent, false, "member._backContent", true);
      const front = member.rarity === 4;
      active(view._frontThumbRoot, front, "member._frontThumbRoot", true);
      active(view._backThumbRoot, !front, "member._backThumbRoot", true);
      art(front ? view._frontThumbnailAddrImage : view._backThumbnailAddrImage, member.characterUrl, "member.character", member.characterSpriteKey);
      art(front ? view._frontBackgroundAddrImage : view._backBackgroundAddrImage, member.backgroundUrl, "member.background", member.backgroundSpriteKey);
      active(view._bandLogoAddrImage, Boolean(member.bandLogoUrl), "member._bandLogoAddrImage");
      if (member.bandLogoUrl) art(view._bandLogoAddrImage, member.bandLogoUrl, "member.bandLogo", member.bandLogoSpriteKey);
      if (Array.isArray(view._invalidBandLabels)) {
        view._invalidBandLabels.forEach(ref => active(ref, false, "member._invalidBandLabels"));
      }
    } else {
      // UISupportCardPresenter's native constructor sets EnvelopeParent (4),
      // including square list items whose serialized default is still 0.
      art(view._thumbnailAddrImage, card.thumbnailUrl, `${label}.thumbnail`, card.thumbnailSpriteKey, support ? 4 : undefined);
      active(view._bandLogoAddrImage, false, `${label}._bandLogoAddrImage`);
    }
  }
  // Type/link bonus glows belong to gameplay context, not the chosen card identity.
  for (const node of nodes) for (const c of node.components) {
    if (c._enabledLinkBonus !== undefined) patch(node, className(c), "_enabledLinkBonus", 0);
    if (c._enabledTypeBonus !== undefined) patch(node, className(c), "_enabledTypeBonus", 0);
    active(c._linkBonusIcon, false, `${className(c)}._linkBonusIcon`);
    const glows = record(c._glowsByCardType);
    if (Array.isArray(glows?._list)) for (const value of glows._list) {
      active(record(value)?.Value, false, `${className(c)}._glowsByCardType`);
    }
  }
  return { patches };
}

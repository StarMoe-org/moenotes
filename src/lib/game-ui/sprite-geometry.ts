import type { NativeSpriteGeometry } from "./card-fixture";

type Geometries = Readonly<Record<string, { geometry: NativeSpriteGeometry }>>;
type Size = { width: number; height: number };

/** The asset service exports the texture rect as the integer crop floor(min)..ceil(max); the renderer requires it. */
const crop = ({ x, y, width, height }: NativeSpriteGeometry["textureRect"]): Size =>
  ({ width: Math.ceil(x + width) - Math.floor(x), height: Math.ceil(y + height) - Math.floor(y) });

/** `MemberCard/64/member_thumbnail[square]` belongs to `MemberCard/*\/member_thumbnail[square]`. */
const family = (key: string): string | null => {
  const parts = key.split("/");
  return parts.length >= 3 && /^\d+$/.test(parts[1]!) ? [parts[0], "*", ...parts.slice(2)].join("/") : null;
};

interface SpriteImage { key: string; url: string; owner: Record<string, unknown>; field: string }

/** Every `{fooUrl, fooSpriteKey}` pair of a fixture's data. */
function spriteImages(value: unknown, out: SpriteImage[] = []): SpriteImage[] {
  if (Array.isArray(value)) { for (const item of value) spriteImages(item, out); return out; }
  if (!value || typeof value !== "object") return out;
  const record = value as Record<string, unknown>;
  for (const [field, key] of Object.entries(record)) {
    const url = field.endsWith("SpriteKey") ? record[`${field.slice(0, -"SpriteKey".length)}Url`] : undefined;
    if (typeof key === "string" && typeof url === "string" && url) out.push({ key, url, owner: record, field });
    else spriteImages(key, out);
  }
  return out;
}

/**
 * Match a fixture's sprite images with the library's geometry records before rendering; the renderer rejects an
 * image whose size is not the recorded texture crop. The library records each card sprite it knows, and sprites of
 * one kind (for example every `member_thumbnail[square]`) share their rect. A card newer than the library has no
 * record: when its image has the crop of an untrimmed record of its kind (texture filling the rect at offset 0),
 * that record describes it exactly and is used. An image that matches no record (a newer card's trimmed export, or a
 * file the asset service has since exported again) is drawn without a recorded geometry, in its prefab rect.
 * Returns the geometries and a copy of `data` without the sprite keys of those images.
 */
export async function completeSpriteGeometries<T>(
  geometries: Geometries,
  data: T,
  imageSize: (url: string) => Promise<Size>,
): Promise<{ geometries: Geometries; data: T }> {
  const copy = structuredClone(data);
  const images = spriteImages(copy);
  if (!images.length) return { geometries, data: copy };
  const untrimmed = new Map<string, NativeSpriteGeometry[]>();
  for (const [key, { geometry }] of Object.entries(geometries)) {
    const kind = family(key);
    if (kind && geometry.textureRectOffset.x === 0 && geometry.textureRectOffset.y === 0) {
      untrimmed.set(kind, [...untrimmed.get(kind) ?? [], geometry]);
    }
  }
  const fits = (geometry: NativeSpriteGeometry, size: Size) => {
    const expected = crop(geometry.textureRect);
    return expected.width === size.width && expected.height === size.height;
  };
  const added: Record<string, { geometry: NativeSpriteGeometry }> = {};
  await Promise.all(images.map(async image => {
    const size = await imageSize(image.url).catch(() => null);
    if (!size) return;
    const recorded = geometries[image.key]?.geometry;
    if (recorded && fits(recorded, size)) return;
    const kind = family(image.key);
    const match = !recorded && kind ? untrimmed.get(kind)?.find(geometry => fits(geometry, size)) : undefined;
    if (match) added[image.key] = { geometry: structuredClone(match) };
    else delete image.owner[image.field];
  }));
  return { geometries: Object.keys(added).length ? { ...geometries, ...added } : geometries, data: copy };
}

/** The natural size of an image URL, decoded by the browser. */
export async function browserImageSize(url: string): Promise<Size> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight };
}

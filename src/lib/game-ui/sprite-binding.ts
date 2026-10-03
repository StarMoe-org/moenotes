import type { NativeCardFixtureData, NativeMemberCardData, NativeSupportCardData } from "./card-fixture";
import type { NativeFormationFixtureData } from "./formation-fixture";
import { resolveNativeSpriteKey, type NativeUiLibrary } from "./source";

type FixtureData = NativeCardFixtureData | NativeFormationFixtureData;
type SpriteSource = Pick<NativeUiLibrary, "manifest" | "spriteUrl">;

/** Complete directories bind every image; sparse bitmap declarations bind only their exact keys. */
export async function bindNativeSprites<T extends FixtureData>(source: SpriteSource, data: T): Promise<T> {
  const sprites = source.manifest.dynamicSprites ?? source.manifest.spriteBitmaps;
  if (sprites === undefined) return data;
  const complete = source.manifest.dynamicSprites !== undefined;
  const resolve = (key: string | undefined, image: string): string | undefined => {
    if (complete) {
      if (!key) throw new Error(`Native image has no source Sprite key: ${image}`);
      return resolveNativeSpriteKey(sprites, key);
    }
    if (!key) return undefined;
    if (!/^[^\[\]\r\n]+\[[^\[\]\r\n]+\]$/.test(key)) throw new Error(`Native bitmap binding requires an exact Sprite key: ${key}`);
    return Object.hasOwn(sprites, key) ? key : undefined;
  };
  async function member(card: NativeMemberCardData | undefined): Promise<NativeMemberCardData | undefined> {
    if (!card) return undefined;
    const next = { ...card };
    const bindings = [["thumbnailUrl", "thumbnailSpriteKey"], ["characterUrl", "characterSpriteKey"],
      ["backgroundUrl", "backgroundSpriteKey"], ["bandLogoUrl", "bandLogoSpriteKey"]] as const;
    await Promise.all(bindings.map(async ([image, sprite]) => {
      if (!card![image]) return;
      const exact = resolve(card![sprite], image);
      if (!exact) return;
      next[sprite] = exact;
      next[image] = await source.spriteUrl(exact);
    }));
    return next;
  }
  async function support(card: NativeSupportCardData | undefined): Promise<NativeSupportCardData | undefined> {
    if (!card) return undefined;
    const exact = resolve(card.thumbnailSpriteKey, "support.thumbnailUrl");
    if (!exact) return card;
    return { ...card, thumbnailSpriteKey: exact, thumbnailUrl: await source.spriteUrl(exact) };
  }
  if ("slots" in data) return { ...data, slots: await Promise.all(data.slots.map(async slot => ({
    ...slot, member: await member(slot.member), support: await support(slot.support),
  }))) } as T;
  return { ...data, member: await member(data.member), support: await support(data.support) } as T;
}

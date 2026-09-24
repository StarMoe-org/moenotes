import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import { getCardThumbnailUrl } from "@/lib/cards/assets";
import type { CardViewModel, RawText } from "@/lib/cards/data";
import type { DegreeViewModel } from "@/lib/degrees/data";
import { getItemIconUrl } from "@/lib/items/assets";
import type { ItemViewModel } from "@/lib/items/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { MusicViewModel } from "@/lib/music/data";
import type { StampViewModel } from "@/lib/stamps/data";
import { getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

/** Shared shape of MasterSeasonPassReward, MasterMissionReward, MasterLoginBonusSlot, … */
export interface RawResource {
  resourceType: number;
  resourceId: number;
  resourceCount: number;
}

export interface RawHomeSpot {
  id: number;
  nameTextId: string;
  thumbnailAssetPath: string;
}

export type RewardKind = "item" | "member" | "support" | "music" | "stamp" | "degree" | "spot" | "other";

export interface RewardViewModel {
  kind: RewardKind;
  id: number;
  count: number;
  /** Empty when the resource is unknown; the UI then shows the kind and id. */
  name: string;
  imageUrl: string;
  /** Page on this site that shows the resource. */
  link?: { routeId: string; detailId?: number };
}

// MasterData resourceType, identified by matching reward ids against the referenced tables.
const kindByResourceType: Record<number, RewardKind> = { 1: "item", 2: "member", 3: "support", 8: "music", 9: "stamp", 17: "degree", 19: "spot" };

export interface RewardSources {
  items: ItemViewModel[];
  cards: CardViewModel[];
  supportCards: SupportCardViewModel[];
  music: MusicViewModel[];
  stamps: StampViewModel[];
  degrees: DegreeViewModel[];
  spots: RawHomeSpot[];
  texts: RawText[];
}

export type RewardResolver = (resource: RawResource) => RewardViewModel;

export function createRewardResolver(sources: RewardSources, locale: AppLocale): RewardResolver {
  const byId = <T extends { id: number }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
  const items = byId(sources.items);
  const cards = byId(sources.cards);
  const supportCards = byId(sources.supportCards);
  const music = byId(sources.music);
  const stamps = byId(sources.stamps);
  const degrees = byId(sources.degrees);
  const spots = byId(sources.spots);
  const textMap = new Map(sources.texts.map((row) => [row.id, row]));

  return ({ resourceType, resourceId: id, resourceCount: count }) => {
    const kind = kindByResourceType[resourceType] ?? "other";
    const base = { kind, id, count, name: "", imageUrl: "" };
    switch (kind) {
      case "item": {
        const item = items.get(id);
        return item ? { ...base, name: item.name, imageUrl: getItemIconUrl(item.imagePath, locale), link: { routeId: "items" } } : base;
      }
      case "member": {
        const card = cards.get(id);
        return card ? { ...base, name: `${card.characterName} · ${card.title}`, imageUrl: getCardThumbnailUrl(card.assetId), link: { routeId: "cards", detailId: id } } : base;
      }
      case "support": {
        const card = supportCards.get(id);
        return card ? { ...base, name: `${card.name} · ${card.title}`, imageUrl: getSupportCardThumbnailUrl(card.assetId), link: { routeId: "support-cards", detailId: id } } : base;
      }
      case "music": {
        const song = music.get(id);
        return song ? { ...base, name: song.title, imageUrl: song.jacketUrl, link: { routeId: "music", detailId: id } } : base;
      }
      case "stamp": {
        const stamp = stamps.get(id);
        return stamp ? { ...base, name: stamp.name, imageUrl: stamp.imageUrl, link: { routeId: "stamps" } } : base;
      }
      case "degree": {
        const degree = degrees.get(id);
        return degree ? { ...base, name: degree.name, imageUrl: degree.imageUrl, link: { routeId: "titles" } } : base;
      }
      case "spot": {
        const spot = spots.get(id);
        return spot ? { ...base, name: localizeMasterText(textMap.get(spot.nameTextId), locale), imageUrl: getImageAssetUrl(spot.thumbnailAssetPath, locale) } : base;
      }
      default:
        return base;
    }
  };
}

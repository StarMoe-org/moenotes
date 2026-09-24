import type { CardViewModel } from "@/lib/cards/data";
import type { GachaViewModel } from "@/lib/gacha/data";
import type { MusicViewModel } from "@/lib/music/data";
import type { RewardEntryKind, RewardEntrySummary } from "@/lib/rewards/data";
import { compareByStartDesc, parseMasterDate } from "@/lib/schedule";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

export interface RawHomeBanner {
  id: number;
  imageAsset: string;
  displayType: number;
  contentId: number;
  displayOrder: number;
  startAt: string;
  endAt: string;
}

export type HomeSlideKind = "event" | "gacha" | "live" | "mission" | "seasonPass";

export interface HomeLink {
  routeId: string;
  detail?: number | string;
}

export interface HomeSlide {
  id: number;
  kind: HomeSlideKind;
  /** Empty when MasterData has no name for the banner target; the UI falls back to the kind label. */
  title: string;
  imagePath: string;
  startAt: string;
  endAt: string;
  link?: HomeLink;
}

export interface HomeData {
  slides: HomeSlide[];
  /** Time-limited passes, missions and login bonuses, newest first. */
  rewards: RewardEntrySummary[];
  latestMusic: MusicViewModel[];
  latestCards: CardViewModel[];
  latestSupportCards: SupportCardViewModel[];
}

// MasterHomeBanner.displayType names the screen a banner opens.
const bannerKinds: Record<number, HomeSlideKind> = { 2: "gacha", 3: "live", 24: "mission", 25: "seasonPass" };
// Shop packs and the placeholder banner are not promotions of game content.
const hiddenBannerTypes = new Set([4, 17]);
const rewardKindBySlide: Partial<Record<HomeSlideKind, RewardEntryKind>> = { mission: "mission", seasonPass: "seasonPass" };

const LATEST_LIMIT = 6;

export function buildHomeData(
  banners: RawHomeBanner[],
  gachas: GachaViewModel[],
  rewards: RewardEntrySummary[],
  music: MusicViewModel[],
  cards: CardViewModel[],
  supportCards: SupportCardViewModel[],
  now = Date.now(),
): HomeData {
  const gachaMap = new Map(gachas.map((gacha) => [gacha.id, gacha]));
  const rewardMap = new Map(rewards.map((entry) => [`${entry.kind}:${entry.id}`, entry]));

  const slides = banners
    .filter((banner) => !hiddenBannerTypes.has(banner.displayType))
    // Ended banners are dropped at build time; the carousel re-checks the window in the browser.
    .filter((banner) => (parseMasterDate(banner.endAt) ?? Infinity) >= now)
    .sort((a, b) => b.displayOrder - a.displayOrder || a.id - b.id)
    .map((banner): HomeSlide => {
      const kind = bannerKinds[banner.displayType] ?? "event";
      const slide: HomeSlide = { id: banner.id, kind, title: "", imagePath: banner.imageAsset, startAt: banner.startAt, endAt: banner.endAt };
      const rewardKind = rewardKindBySlide[kind];
      if (kind === "gacha") {
        const gacha = gachaMap.get(banner.contentId);
        if (gacha) {
          slide.title = gacha.name;
          slide.link = { routeId: "gacha", detail: gacha.id };
        }
      } else if (kind === "live") {
        slide.link = { routeId: "music" };
      } else if (rewardKind) {
        const entry = rewardMap.get(`${rewardKind}:${banner.contentId}`);
        if (entry) {
          slide.title = entry.title;
          slide.link = { routeId: "rewards", detail: entry.slug };
        }
      }
      return slide;
    });

  return {
    slides,
    // Permanent entries (daily login bonus, beginner missions) are not news.
    rewards: rewards.filter((entry) => parseMasterDate(entry.endAt) !== null).sort(compareByStartDesc).slice(0, LATEST_LIMIT),
    latestMusic: [...music].sort(compareByStartDesc).slice(0, LATEST_LIMIT),
    latestCards: [...cards].sort(compareByStartDesc).slice(0, LATEST_LIMIT),
    latestSupportCards: [...supportCards].sort(compareByStartDesc).slice(0, LATEST_LIMIT),
  };
}

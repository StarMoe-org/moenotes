import type { AppLocale } from "@/config/locales";
import type { CardViewModel, RawText } from "@/lib/cards/data";
import type { GachaViewModel } from "@/lib/gacha/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { MusicViewModel } from "@/lib/music/data";
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

/** MasterEvent is still empty in current dumps; only the common schedule fields are read. */
export interface RawEvent {
  id: number;
  nameTextId?: string;
  nameTextID?: string;
  startAt?: string;
  endAt?: string;
}

export interface RawLimitedMissionGroup {
  id: number;
  nameTextID: string;
  bannerAsset: string;
  startAt: string;
  endAt: string;
}

export interface RawLoginBonus {
  id: number;
  nameTextID: string;
  startAt: string;
  endAt: string;
}

export interface RawSeasonPass {
  id: number;
  nameTextId: string;
  bannerAsset: string;
  startAt: string;
  endAt: string;
}

export type HomeActivityKind = "event" | "gacha" | "live" | "mission" | "loginBonus" | "seasonPass";

export interface HomeLink {
  routeId: string;
  detailId?: number;
}

export interface HomeSlide {
  id: number;
  kind: HomeActivityKind;
  /** Empty when MasterData has no name for the banner target; the UI falls back to the kind label. */
  title: string;
  imagePath: string;
  startAt: string;
  endAt: string;
  link?: HomeLink;
}

export interface HomeActivity {
  id: string;
  kind: HomeActivityKind;
  title: string;
  imagePath: string;
  startAt: string;
  endAt: string;
}

export interface HomeMasterData {
  banners: RawHomeBanner[];
  events: RawEvent[];
  missions: RawLimitedMissionGroup[];
  loginBonuses: RawLoginBonus[];
  seasonPasses: RawSeasonPass[];
  texts: RawText[];
}

export interface HomeData {
  slides: HomeSlide[];
  activities: HomeActivity[];
  latestMusic: MusicViewModel[];
  latestCards: CardViewModel[];
  latestSupportCards: SupportCardViewModel[];
}

// MasterHomeBanner.displayType names the screen a banner opens.
const bannerKinds: Record<number, HomeActivityKind> = { 2: "gacha", 3: "live", 24: "mission", 25: "seasonPass" };
// Shop packs and the placeholder banner are not activities.
const hiddenBannerTypes = new Set([4, 17]);

const LATEST_LIMIT = 6;

export function buildHomeData(
  data: HomeMasterData,
  gachas: GachaViewModel[],
  music: MusicViewModel[],
  cards: CardViewModel[],
  supportCards: SupportCardViewModel[],
  locale: AppLocale,
  now = Date.now(),
): HomeData {
  const textMap = new Map(data.texts.map((row) => [row.id, row]));
  const text = (id: string | undefined) => (id ? localizeMasterText(textMap.get(id), locale) : "");
  const gachaMap = new Map(gachas.map((gacha) => [gacha.id, gacha]));
  const eventMap = new Map(data.events.map((event) => [event.id, event]));
  const missionMap = new Map(data.missions.map((mission) => [mission.id, mission]));
  const passMap = new Map(data.seasonPasses.map((pass) => [pass.id, pass]));

  const slides = data.banners
    .filter((banner) => !hiddenBannerTypes.has(banner.displayType))
    // Ended banners are dropped at build time; the carousel re-checks the window in the browser.
    .filter((banner) => (parseMasterDate(banner.endAt) ?? Infinity) >= now)
    .sort((a, b) => b.displayOrder - a.displayOrder || a.id - b.id)
    .map((banner): HomeSlide => {
      const kind = bannerKinds[banner.displayType] ?? "event";
      const slide: HomeSlide = { id: banner.id, kind, title: "", imagePath: banner.imageAsset, startAt: banner.startAt, endAt: banner.endAt };
      if (kind === "gacha") {
        const gacha = gachaMap.get(banner.contentId);
        slide.title = gacha?.name ?? "";
        if (gacha) slide.link = { routeId: "gacha", detailId: gacha.id };
      } else if (kind === "live") {
        slide.link = { routeId: "music" };
      } else if (kind === "mission") {
        slide.title = text(missionMap.get(banner.contentId)?.nameTextID);
      } else if (kind === "seasonPass") {
        slide.title = text(passMap.get(banner.contentId)?.nameTextId);
      } else {
        const event = eventMap.get(banner.contentId);
        slide.title = text(event?.nameTextId || event?.nameTextID);
      }
      return slide;
    });

  const activities: HomeActivity[] = [
    ...data.events.map((event) => ({
      id: `event-${event.id}`, kind: "event" as const, title: text(event.nameTextId || event.nameTextID) || `#${event.id}`,
      imagePath: "", startAt: event.startAt ?? "", endAt: event.endAt ?? "",
    })),
    ...data.missions.map((mission) => ({
      id: `mission-${mission.id}`, kind: "mission" as const, title: text(mission.nameTextID) || `#${mission.id}`,
      imagePath: mission.bannerAsset ? `Image/Banner/${mission.bannerAsset}` : "", startAt: mission.startAt, endAt: mission.endAt,
    })),
    ...data.loginBonuses.map((bonus) => ({
      id: `loginBonus-${bonus.id}`, kind: "loginBonus" as const, title: text(bonus.nameTextID) || `#${bonus.id}`,
      imagePath: "", startAt: bonus.startAt, endAt: bonus.endAt,
    })),
    ...data.seasonPasses.map((pass) => ({
      id: `seasonPass-${pass.id}`, kind: "seasonPass" as const, title: text(pass.nameTextId) || `#${pass.id}`,
      imagePath: pass.bannerAsset ? `SeasonPass/Banner/${pass.bannerAsset}` : "", startAt: pass.startAt, endAt: pass.endAt,
    })),
  ]
    // Only time-limited entries are activities; permanent login bonuses and beginner missions are not.
    .filter((activity) => parseMasterDate(activity.endAt) !== null)
    .sort(compareByStartDesc)
    .slice(0, LATEST_LIMIT);

  return {
    slides,
    activities,
    latestMusic: [...music].sort(compareByStartDesc).slice(0, LATEST_LIMIT),
    latestCards: [...cards].sort(compareByStartDesc).slice(0, LATEST_LIMIT),
    latestSupportCards: [...supportCards].sort(compareByStartDesc).slice(0, LATEST_LIMIT),
  };
}

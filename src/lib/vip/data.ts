import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { RawResource, RewardResolver, RewardViewModel } from "@/lib/rewards/resources";

/** T.G.W CARD, the membership ladder: MasterVip and its reward, bonus and login-point tables. */
export interface RawVip {
  vipRank: number;
  /** Points needed to reach the rank. */
  point: number;
  productsPrice: number;
}

export interface RawVipDailyReward extends RawResource {
  vipRank: number;
  day: number;
}

export interface RawVipRankUpReward extends RawResource {
  vipRank: number;
}

export interface RawVipRankBonus {
  vipRank: number;
  vipBonusType: number;
  value: number;
}

export interface RawVipDailyPoint {
  consecutiveCount: number;
  point: number;
}

export type TgwCardColor = "normal" | "gold" | "platinum" | "black";

/**
 * The card face's colour by rank, as the game's `Image/Tgw/tgwcard_{color}_{rank}` sprites are named: ranks 1–5 are
 * normal, 6–10 gold, 11–15 platinum, 16 and up black (the ladder ends at 21).
 */
export const TGW_CARD_COLOR_BANDS: ReadonlyArray<readonly [maxRank: number, color: TgwCardColor]> = [
  [5, "normal"],
  [10, "gold"],
  [15, "platinum"],
  [Number.POSITIVE_INFINITY, "black"],
];

export function tgwCardColor(rank: number): TgwCardColor {
  return TGW_CARD_COLOR_BANDS.find(([max]) => rank <= max)?.[1] ?? "black";
}

export function tgwCardImageUrl(rank: number, locale: AppLocale): string {
  if (!Number.isSafeInteger(rank) || rank <= 0) return "";
  return getImageAssetUrl(`Image/Tgw/tgwcard_${tgwCardColor(rank)}_${rank}`, locale);
}

/**
 * How a benefit's value reads (MasterVipRankBonus `_vipBonusType`), following the game's `ui_vip_bonus_value_*`
 * formats: "ratio" values are basis points shown as "+n% UP" (5 studio rewards, 7 all parameters), "ratioDown" basis
 * points as "n% shorter" (2 boost recovery time), "seconds" a duration (6 studio time limit), "unlock" a feature
 * with no amount (4 the T.G.W CARD gacha), and "count" a plain "+n" (1 formations, 3 boost cap, 8 free event pulls,
 * 9 boost consumption cap). An empty formatted value reads as "unlocked".
 */
export type TgwBonusFormat = "count" | "ratio" | "ratioDown" | "seconds" | "unlock";

const BONUS_FORMATS: Readonly<Record<number, TgwBonusFormat>> = { 1: "count", 2: "ratioDown", 3: "count", 4: "unlock", 5: "ratio", 6: "seconds", 7: "ratio", 8: "count", 9: "count" };

export function tgwBonusFormat(bonusType: number): TgwBonusFormat {
  return BONUS_FORMATS[bonusType] ?? "count";
}

export interface TgwBonusViewModel {
  type: number;
  /** The game's name of the benefit (MasterText `ui_vip_bonus_type_{type}`). */
  name: string;
  format: TgwBonusFormat;
  /** Raw MasterData value: basis points for ratios, seconds for durations, a count otherwise. */
  value: number;
}

export interface TgwRankViewModel {
  rank: number;
  /** Points needed to reach the rank. */
  point: number;
  color: TgwCardColor;
  imageUrl: string;
  dailyRewards: RewardViewModel[];
  rankUpRewards: RewardViewModel[];
  bonuses: TgwBonusViewModel[];
}

export interface TgwCardViewModel {
  /** MasterText `ui_title_vip_top` ("T.G.W CARD"). */
  title: string;
  /** MasterText `ui_vip_point`. */
  pointName: string;
  /** MasterText `ui_vip_rank` ("RANK"). */
  rankLabel: string;
  ranks: TgwRankViewModel[];
  /** Points a login earns by consecutive days; the last row holds from then on. */
  dailyPoints: Array<{ consecutiveDays: number; point: number }>;
}

export interface TgwCardSources {
  vips: RawVip[];
  dailyRewards: RawVipDailyReward[];
  rankUpRewards: RawVipRankUpReward[];
  bonuses: RawVipRankBonus[];
  dailyPoints: RawVipDailyPoint[];
  texts: RawText[];
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const value = key(row);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  }
  return groups;
}

export function normalizeTgwCard(sources: TgwCardSources, resolve: RewardResolver, locale: AppLocale): TgwCardViewModel {
  const textMap = new Map(sources.texts.map((row) => [row.id, row]));
  const text = (id: string) => localizeMasterText(textMap.get(id), locale);
  const daily = groupBy(sources.dailyRewards, (row) => row.vipRank);
  const rankUp = groupBy(sources.rankUpRewards, (row) => row.vipRank);
  const bonuses = groupBy(sources.bonuses, (row) => row.vipRank);
  const ranks = [...sources.vips]
    .filter((vip) => Number.isSafeInteger(vip.vipRank) && vip.vipRank > 0)
    .sort((a, b) => a.vipRank - b.vipRank)
    .map((vip): TgwRankViewModel => ({
      rank: vip.vipRank,
      point: Math.max(0, vip.point),
      color: tgwCardColor(vip.vipRank),
      imageUrl: tgwCardImageUrl(vip.vipRank, locale),
      dailyRewards: [...(daily.get(vip.vipRank) ?? [])].sort((a, b) => a.day - b.day).map((row) => resolve(row)),
      rankUpRewards: (rankUp.get(vip.vipRank) ?? []).map((row) => resolve(row)),
      bonuses: [...(bonuses.get(vip.vipRank) ?? [])]
        .sort((a, b) => a.vipBonusType - b.vipBonusType)
        .map((bonus) => ({ type: bonus.vipBonusType, name: text(`ui_vip_bonus_type_${bonus.vipBonusType}`), format: tgwBonusFormat(bonus.vipBonusType), value: bonus.value })),
    }));
  return {
    title: text("ui_title_vip_top"),
    pointName: text("ui_vip_point"),
    rankLabel: text("ui_vip_rank"),
    ranks,
    dailyPoints: [...sources.dailyPoints]
      .sort((a, b) => a.consecutiveCount - b.consecutiveCount)
      .map((row) => ({ consecutiveDays: row.consecutiveCount, point: row.point })),
  };
}

/** A benefit's amount as the page prints it, with the unit words passed in (they are UI copy). */
export function formatTgwBonusValue(
  bonus: Pick<TgwBonusViewModel, "format" | "value">,
  locale: AppLocale,
  units: { hours: string; minutes: string; percentUp: (value: string) => string; percentDown: (value: string) => string },
): string {
  const number = (value: number, digits = 2) => value.toLocaleString(locale, { maximumFractionDigits: digits });
  switch (bonus.format) {
    case "ratio": return units.percentUp(number(bonus.value / 100));
    case "ratioDown": return units.percentDown(number(bonus.value / 100));
    case "seconds": {
      const hours = Math.floor(bonus.value / 3600);
      const minutes = Math.round((bonus.value % 3600) / 60);
      return `+${[hours ? `${number(hours)}${units.hours}` : "", minutes ? `${number(minutes)}${units.minutes}` : ""].filter(Boolean).join(" ") || `0${units.minutes}`}`;
    }
    case "unlock": return "";
    // A zero count opens the feature without raising it yet (the boost consumption setting from rank 3).
    default: return bonus.value ? `+${number(bonus.value)}` : "";
  }
}

/** `?rank=N` of the T.G.W CARD page, when it names a rank. */
export function parseTgwRankParam(search: string): number | null {
  const value = Number(new URLSearchParams(search).get("rank"));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

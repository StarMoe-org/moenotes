import type { RawResource, RewardViewModel } from "@/lib/rewards/resources";
import type { EntityLink } from "@/lib/route/entity-link";

/*
 * Where an item comes from and what it is spent on, read backwards from the tables that hand out or consume resources
 * (MasterData resourceType 1 is an item). Every function here is pure: the build selectors (build-item-sources.ts)
 * feed it the view models other pages already build (events, rewards, gacha, exchange shops) and a few raw tables.
 */

const ITEM_RESOURCE_TYPE = 1;

/** Kinds of place an item is handed out, in the order the item page lists them. */
export const ITEM_SOURCE_KINDS = [
  "event", "exchange", "shop", "gacha", "seasonPass", "loginBonus", "limitedMission", "mission", "characterMission",
  "characterRank", "friendshipRank", "story", "music",
] as const;
export type ItemSourceKind = typeof ITEM_SOURCE_KINDS[number];

/** Which part of a source hands the item out (`items.sources.details.<detail>`). */
export type ItemSourceDetail =
  | "pointReward" | "liveReward" | "challengeLive" | "eventMission" | "boxGacha" | "ranking"
  | "product" | "prize" | "drawBonus" | "free" | "premium" | "loginDay" | "missionReward" | "completeReward"
  | "rankReward" | "episodeReward" | "scoreReward" | "comboReward";

export interface ItemSourceRef {
  kind: ItemSourceKind;
  /** Identifies the source within its kind (event id, story category, …); refs of the same kind and key merge. */
  key: string;
  /** The source's own name; "" when the page names it from its kind alone (e.g. "every character"). */
  name: string;
  detail: ItemSourceDetail;
  link?: EntityLink;
}

export interface ItemSourceEntry {
  kind: ItemSourceKind;
  key: string;
  name: string;
  /** Distinct parts of the source that hand the item out, in first-seen order. */
  details: ItemSourceDetail[];
  /** Items handed out over every row of the source. */
  total: number;
  /** Rows of the source that hand it out. */
  times: number;
  link?: EntityLink;
}

export interface ItemSourceCollector {
  add(itemId: number, count: number, ref: ItemSourceRef): void;
  /** A resolved reward: only items count. */
  addReward(reward: Pick<RewardViewModel, "kind" | "id" | "count">, ref: ItemSourceRef): void;
  /** A raw resource row (resourceType / resourceId / resourceCount): only resource type 1 counts. */
  addResource(resource: RawResource, ref: ItemSourceRef): void;
  /** Every item's sources, ordered by kind (ITEM_SOURCE_KINDS) and then by first appearance. */
  result(): Map<number, ItemSourceEntry[]>;
}

export function createItemSourceCollector(): ItemSourceCollector {
  const byItem = new Map<number, Map<string, ItemSourceEntry>>();
  const add = (itemId: number, count: number, ref: ItemSourceRef) => {
    if (!Number.isSafeInteger(itemId) || itemId <= 0) return;
    let entries = byItem.get(itemId);
    if (!entries) byItem.set(itemId, entries = new Map());
    const key = `${ref.kind}:${ref.key}`;
    const entry = entries.get(key);
    const amount = Number.isFinite(count) && count > 0 ? count : 0;
    if (entry) {
      entry.total += amount;
      entry.times += 1;
      if (!entry.details.includes(ref.detail)) entry.details.push(ref.detail);
      return;
    }
    entries.set(key, {
      kind: ref.kind, key: ref.key, name: ref.name, details: [ref.detail], total: amount, times: 1,
      ...(ref.link ? { link: ref.link } : {}),
    });
  };
  return {
    add,
    addReward(reward, ref) {
      if (reward.kind === "item") add(reward.id, reward.count, ref);
    },
    addResource(resource, ref) {
      if (resource.resourceType === ITEM_RESOURCE_TYPE) add(resource.resourceId, resource.resourceCount, ref);
    },
    result() {
      const order = (kind: ItemSourceKind) => ITEM_SOURCE_KINDS.indexOf(kind);
      return new Map([...byItem].map(([itemId, entries]) => [
        itemId,
        // Array.prototype.sort is stable, so entries of one kind keep their first-seen order.
        [...entries.values()].sort((a, b) => order(a.kind) - order(b.kind)),
      ]));
    },
  };
}

// ---- Walkers over the view models other pages build ----

type Reward = Pick<RewardViewModel, "kind" | "id" | "count">;

export interface EventSourceView {
  id: number;
  name: string;
  pointRewards: Array<{ rewards: Reward[] }>;
  loopReward: { rewards: Reward[] } | null;
  live: Array<{ rewards: Reward[] }>;
  challengeLive: Array<{ rewards: Reward[] }>;
  missions: Array<{ rewards: Reward[] }>;
  boxGacha: { boxes: Array<{ items: Reward[] }>; loop: { items: Reward[] } | null } | null;
  rankingRewards: Array<{ rewards: Reward[] }>;
  challengeMusic: { songs: Array<{ ranking: Array<{ rewards: Reward[] }> }> } | null;
}

export function addEventSources(collector: ItemSourceCollector, events: readonly EventSourceView[]): void {
  for (const event of events) {
    const ref = (detail: ItemSourceDetail): ItemSourceRef => ({ kind: "event", key: String(event.id), name: event.name, detail, link: { routeId: "events", detailId: event.id } });
    const each = (rewards: readonly Reward[], detail: ItemSourceDetail) => {
      for (const reward of rewards) collector.addReward(reward, ref(detail));
    };
    for (const row of event.pointRewards) each(row.rewards, "pointReward");
    if (event.loopReward) each(event.loopReward.rewards, "pointReward");
    for (const row of event.live) each(row.rewards, "liveReward");
    for (const row of event.challengeLive) each(row.rewards, "challengeLive");
    for (const row of event.missions) each(row.rewards, "eventMission");
    for (const box of event.boxGacha?.boxes ?? []) each(box.items, "boxGacha");
    if (event.boxGacha?.loop) each(event.boxGacha.loop.items, "boxGacha");
    for (const row of event.rankingRewards) each(row.rewards, "ranking");
    for (const song of event.challengeMusic?.songs ?? []) for (const row of song.ranking) each(row.rewards, "ranking");
  }
}

export interface ExchangeSourceView {
  id: number;
  name: string;
  products: Array<{ reward: Reward }>;
}

export function addExchangeSources(collector: ItemSourceCollector, exchanges: readonly ExchangeSourceView[]): void {
  for (const exchange of exchanges) {
    const ref: ItemSourceRef = { kind: "exchange", key: String(exchange.id), name: exchange.name, detail: "product", link: { routeId: "exchange", detailId: exchange.id } };
    for (const product of exchange.products) collector.addReward(product.reward, ref);
  }
}

export interface GachaSourceView {
  id: number;
  name: string;
  items: Array<{ id: number; amount: number }>;
  bonusRewards: Array<{ rules: Array<{ rewards: Array<{ reward: Reward }> }> }>;
}

export function addGachaSources(collector: ItemSourceCollector, gachas: readonly GachaSourceView[]): void {
  for (const gacha of gachas) {
    const ref = (detail: ItemSourceDetail): ItemSourceRef => ({ kind: "gacha", key: String(gacha.id), name: gacha.name, detail, link: { routeId: "gacha", detailId: gacha.id } });
    for (const prize of gacha.items) collector.add(prize.id, prize.amount, ref("prize"));
    for (const bonus of gacha.bonusRewards) for (const rule of bonus.rules) for (const entry of rule.rewards) collector.addReward(entry.reward, ref("drawBonus"));
  }
}

/** The rewards page's entries (season passes, login bonuses, limited missions), as rewards/data.ts details them. */
export type RewardEntrySourceView =
  | { kind: "seasonPass"; slug: string; title: string; levels: Array<{ free: Reward[]; premium: Reward[] }>; missionGroups: Array<{ missions: Array<{ rewards: Reward[] }> }> }
  | { kind: "loginBonus"; slug: string; title: string; sheets: Array<{ days: Array<{ rewards: Reward[] }> }> }
  | { kind: "mission"; slug: string; title: string; days: Array<{ missions: Array<{ rewards: Reward[] }> }>; completeRewards: Reward[] };

export function addRewardEntrySources(collector: ItemSourceCollector, entries: readonly RewardEntrySourceView[]): void {
  for (const entry of entries) {
    const kind: ItemSourceKind = entry.kind === "mission" ? "limitedMission" : entry.kind;
    const ref = (detail: ItemSourceDetail): ItemSourceRef => ({ kind, key: entry.slug, name: entry.title, detail, link: { routeId: "rewards", detailId: entry.slug } });
    const each = (rewards: readonly Reward[], detail: ItemSourceDetail) => {
      for (const reward of rewards) collector.addReward(reward, ref(detail));
    };
    if (entry.kind === "seasonPass") {
      for (const level of entry.levels) {
        each(level.free, "free");
        each(level.premium, "premium");
      }
      for (const group of entry.missionGroups) for (const mission of group.missions) each(mission.rewards, "missionReward");
    } else if (entry.kind === "loginBonus") {
      for (const sheet of entry.sheets) for (const day of sheet.days) each(day.rewards, "loginDay");
    } else {
      for (const day of entry.days) for (const mission of day.missions) each(mission.rewards, "missionReward");
      each(entry.completeRewards, "completeReward");
    }
  }
}

// ---- Walkers over raw tables no page details yet ----

export interface RawRewardRow extends RawResource {
  id: number;
}

function rowsById<T extends { id: number }>(rows: readonly T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

/** MasterCharacterRankReward: characterId 0 is every character's reward. */
export function addCharacterRankSources(
  collector: ItemSourceCollector,
  rows: ReadonlyArray<RawResource & { characterId?: number; characterID?: number }>,
  characterName: (id: number) => string,
): void {
  for (const row of rows) {
    const characterId = row.characterId ?? row.characterID ?? 0;
    collector.addResource(row, {
      kind: "characterRank",
      key: String(characterId),
      name: characterId ? characterName(characterId) : "",
      detail: "rankReward",
      link: characterId ? { routeId: "characters", detailId: characterId } : { routeId: "characters" },
    });
  }
}

/** MasterCharacterFriendshipRankReward: keyed by the friendship (MasterCharacterFriendship id); 0 is every pair's. */
export function addFriendshipRankSources(
  collector: ItemSourceCollector,
  rows: ReadonlyArray<RawResource & { characterFriendshipId: number }>,
  pairName: (friendshipId: number) => string,
): void {
  for (const row of rows) {
    collector.addResource(row, {
      kind: "friendshipRank",
      key: String(row.characterFriendshipId),
      name: row.characterFriendshipId ? pairName(row.characterFriendshipId) : "",
      detail: "rankReward",
      link: { routeId: "friendship-story" },
    });
  }
}

/** MasterCharacterMission: templates every character shares; rewards through MasterMissionReward. */
export function addCharacterMissionSources(
  collector: ItemSourceCollector,
  missions: ReadonlyArray<{ missionRewardIds?: number[] }>,
  missionRewards: readonly RawRewardRow[],
): void {
  const rewards = rowsById(missionRewards);
  for (const mission of missions) {
    for (const id of mission.missionRewardIds ?? []) {
      const row = rewards.get(id);
      if (row) collector.addResource(row, { kind: "characterMission", key: "all", name: "", detail: "missionReward", link: { routeId: "characters" } });
    }
  }
}

/** MasterMission: the standing missions (every category is one source: the categories have no names). */
export function addMissionSources(
  collector: ItemSourceCollector,
  missions: ReadonlyArray<{ missionCategory: number; missionRewardIds?: number[] }>,
  missionRewards: readonly RawRewardRow[],
): void {
  const rewards = rowsById(missionRewards);
  for (const mission of missions) {
    for (const id of mission.missionRewardIds ?? []) {
      const row = rewards.get(id);
      if (row) collector.addResource(row, { kind: "mission", key: "all", name: "", detail: "missionReward", link: { routeId: "missions" } });
    }
  }
}

/** Story list routes by story category, for story rewards (a group pays out on many episodes). */
const STORY_LIST_ROUTE: Record<string, string> = { main: "main-story", event: "event-story", friendship: "friendship-story" };

/** MasterStoryReward rows of a group are paid by every episode naming the group; one source per story category. */
export function addStorySources(
  collector: ItemSourceCollector,
  storyRewards: ReadonlyArray<RawResource & { group: number }>,
  stories: ReadonlyArray<{ category: string; rewardGroupId: number; eventRewardGroupId: number }>,
): void {
  const byGroup = new Map<number, Array<RawResource & { group: number }>>();
  for (const row of storyRewards) {
    const list = byGroup.get(row.group);
    if (list) list.push(row);
    else byGroup.set(row.group, [row]);
  }
  for (const story of stories) {
    const route = STORY_LIST_ROUTE[story.category] ?? "other-story";
    for (const group of new Set([story.rewardGroupId, story.eventRewardGroupId].filter((id) => id > 0))) {
      for (const row of byGroup.get(group) ?? []) {
        collector.addResource(row, { kind: "story", key: story.category, name: "", detail: "episodeReward", link: { routeId: route } });
      }
    }
  }
}

/** MasterLiveMusic's score-rank and full-combo reward ids (MasterReward). */
export interface MusicRewardSource {
  id: number;
  title: string;
  scoreRewardIds: number[];
  comboRewardIds: number[];
}

export function addMusicSources(collector: ItemSourceCollector, songs: readonly MusicRewardSource[], rewardRows: readonly RawRewardRow[]): void {
  const rewards = rowsById(rewardRows);
  for (const song of songs) {
    const ref = (detail: ItemSourceDetail): ItemSourceRef => ({ kind: "music", key: String(song.id), name: song.title, detail, link: { routeId: "music", detailId: song.id } });
    for (const id of song.scoreRewardIds) {
      const row = rewards.get(id);
      if (row) collector.addResource(row, ref("scoreReward"));
    }
    for (const id of song.comboRewardIds) {
      const row = rewards.get(id);
      if (row) collector.addResource(row, ref("comboReward"));
    }
  }
}

/** MasterShopProduct, one source per shop (MasterShop); the shop pages are their own feature, so link to the list. */
export function addShopSources(
  collector: ItemSourceCollector,
  products: ReadonlyArray<RawResource & { shopId: number }>,
  shopName: (shopId: number) => string,
): void {
  for (const product of products) {
    collector.addResource(product, { kind: "shop", key: String(product.shopId), name: shopName(product.shopId), detail: "product", link: { routeId: "shop" } });
  }
}

// ---- What an item is spent on ----

export const ITEM_USAGE_KINDS = ["memberTraining", "memberAwaken", "memberLiveSkill", "memberGekisouSkill", "bandItem"] as const;
export type ItemUsageKind = typeof ITEM_USAGE_KINDS[number];

export interface ItemUsageTarget {
  id: number;
  name: string;
  link: EntityLink;
}

/** One way an item is spent: the targets that spend the same amount on it to max out that kind of upgrade. */
export interface ItemUsageEntry {
  kind: ItemUsageKind;
  /** Items one target spends from the first step to the last. */
  perTarget: number;
  /** For member awakening: the item stands in for the card's own piece (the band's piece of the rarity). */
  alternative?: boolean;
  targets: ItemUsageTarget[];
}

export interface UsageCard {
  id: number;
  name: string;
  awakeResourceGroup: number;
  rankGroup: number;
  liveSkillResourceGroup: number;
  gekisouSkillResourceGroup: number;
  /** The card's own piece (MasterMemberCard rankUpItemID); 0 when none. */
  rankUpItemId: number;
  /** The band's piece for the card's rarity (MasterBand rankUpItemIdForRarity…); 0 when none. */
  bandRankUpItemId: number;
}

export interface UsageSources {
  cards: readonly UsageCard[];
  awakeResources: ReadonlyArray<{ group: number; awakeCount: number; itemId: number; count: number }>;
  skillResources: ReadonlyArray<{ group: number; level: number; itemID: number; count: number }>;
  memberRanks: ReadonlyArray<{ group: number; rank: number; requiredRankUpItemCount: number }>;
  bandItems: ReadonlyArray<{ id: number; name: string; resourceGroupId: number }>;
}

/** Item id → count summed over a group's rows. */
function totalsByGroup<T>(rows: readonly T[], group: (row: T) => number, item: (row: T) => number, count: (row: T) => number): Map<number, Map<number, number>> {
  const groups = new Map<number, Map<number, number>>();
  for (const row of rows) {
    let totals = groups.get(group(row));
    if (!totals) groups.set(group(row), totals = new Map());
    totals.set(item(row), (totals.get(item(row)) ?? 0) + count(row));
  }
  return groups;
}

export function collectItemUsages(sources: UsageSources): Map<number, ItemUsageEntry[]> {
  const byItem = new Map<number, Map<string, ItemUsageEntry>>();
  const add = (itemId: number, kind: ItemUsageKind, perTarget: number, target: ItemUsageTarget, alternative = false) => {
    if (itemId <= 0 || perTarget <= 0) return;
    let entries = byItem.get(itemId);
    if (!entries) byItem.set(itemId, entries = new Map());
    const key = `${kind}:${perTarget}:${alternative ? 1 : 0}`;
    const entry = entries.get(key);
    if (entry) {
      if (!entry.targets.some((existing) => existing.id === target.id)) entry.targets.push(target);
    } else {
      entries.set(key, { kind, perTarget, ...(alternative ? { alternative } : {}), targets: [target] });
    }
  };

  const awake = totalsByGroup(sources.awakeResources, (row) => row.group, (row) => row.itemId, (row) => row.count);
  const skills = totalsByGroup(sources.skillResources, (row) => row.group, (row) => row.itemID, (row) => row.count);
  const rankTotals = new Map<number, number>();
  for (const row of sources.memberRanks) rankTotals.set(row.group, (rankTotals.get(row.group) ?? 0) + Math.max(0, row.requiredRankUpItemCount));

  for (const card of sources.cards) {
    const target: ItemUsageTarget = { id: card.id, name: card.name, link: { routeId: "cards", detailId: card.id } };
    for (const [itemId, count] of awake.get(card.awakeResourceGroup) ?? []) add(itemId, "memberTraining", count, target);
    for (const [itemId, count] of skills.get(card.liveSkillResourceGroup) ?? []) add(itemId, "memberLiveSkill", count, target);
    for (const [itemId, count] of skills.get(card.gekisouSkillResourceGroup) ?? []) add(itemId, "memberGekisouSkill", count, target);
    const pieces = rankTotals.get(card.rankGroup) ?? 0;
    add(card.rankUpItemId, "memberAwaken", pieces, target);
    if (card.bandRankUpItemId !== card.rankUpItemId) add(card.bandRankUpItemId, "memberAwaken", pieces, target, true);
  }
  for (const bandItem of sources.bandItems) {
    const target: ItemUsageTarget = { id: bandItem.id, name: bandItem.name, link: { routeId: "band-items", query: { item: String(bandItem.id) } } };
    for (const [itemId, count] of skills.get(bandItem.resourceGroupId) ?? []) add(itemId, "bandItem", count, target);
  }

  const order = (kind: ItemUsageKind) => ITEM_USAGE_KINDS.indexOf(kind);
  return new Map([...byItem].map(([itemId, entries]) => [
    itemId,
    [...entries.values()].sort((a, b) => order(a.kind) - order(b.kind) || Number(a.alternative ?? false) - Number(b.alternative ?? false) || b.perTarget - a.perTarget),
  ]));
}

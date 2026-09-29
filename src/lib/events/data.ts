import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl, getAssetUrl } from "@/lib/assets/url";
import { getBandLogoUrl, getCardThumbnailUrl, getCardTypeIconUrl, getCharacterFaceIconUrl, type CardType } from "@/lib/cards/assets";
import type { CardViewModel, RawBand, RawCharacter, RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { MusicViewModel } from "@/lib/music/data";
import { scoreRankLabel, type RawRewardRow } from "@/lib/rewards/data";
import type { RawResource, RewardResolver, RewardViewModel } from "@/lib/rewards/resources";
import type { StoryEpisodeKind, StoryViewModel } from "@/lib/story/data";
import { getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

export interface RawEvent {
  id: number;
  nameTextId: string;
  startAt: string;
  endAt: string;
  /** The event screen, its rankings and its exchange stay up until then. */
  displayEndAt: string;
  eventType: number;
  storyChapterId: number;
  eventItemId: number;
  isRankingDisabled: boolean;
  isMusicRankingDisabled: boolean;
  isTotalMusicRankingDisabled: boolean;
  liveEventRewardGroup: number;
  liveEventPointGroup: number;
  challengeLiveEventRewardGroup: number;
  challengeLiveEventPointGroup: number;
  musicId: number;
  /** Under Image/Event/, e.g. "01/Logo/event_logo_01_0001". */
  logoAsset: string;
  backgroundAsset: string;
}

/** One bonus: the cards it applies to (at most one target field is set) and its value per card rank, in basis points. */
export interface RawEventEffect {
  id: number;
  eventId: number;
  resourceTypeConstraint: number;
  characterId: number;
  bandId: number;
  cardType: number;
  tagId: number;
  memberCardId: number;
  supportCardId: number;
  eventBonusType: number;
  rank1EffectValue: number;
  rank2EffectValue: number;
  rank3EffectValue: number;
  rank4EffectValue: number;
  rank5EffectValue: number;
}

export interface RawEventPickUpCard {
  id: number;
  eventId: number;
  resourceType: number;
  resourceId: number;
}

export interface RawEventAchievementReward {
  id: number;
  eventId: number;
  eventPoint: number;
  rewardIds: number[];
}

export interface RawEventAchievementLoopReward {
  id: number;
  eventId: number;
  loopStartEventPoint: number;
  loopEventPoint: number;
  rewardIds: number[];
}

/** MasterLiveEventPoint / MasterChallengeLiveEventPoint: points one live earns at a score rank. */
export interface RawLiveEventPoint {
  group: number;
  scoreRank: number;
  value: number;
}

/** MasterLiveEventReward / MasterChallengeLiveEventReward: what one live yields at a score rank. */
export interface RawLiveEventReward extends RawResource {
  id: number;
  eventGroup: number;
  scoreRank: number;
  /** Basis points; 10000 is every live. */
  probability: number;
}

export interface EventMasterData {
  events: RawEvent[];
  effects: RawEventEffect[];
  pickUpCards: RawEventPickUpCard[];
  achievementRewards: RawEventAchievementReward[];
  loopRewards: RawEventAchievementLoopReward[];
  livePoints: RawLiveEventPoint[];
  liveRewards: RawLiveEventReward[];
  challengePoints: RawLiveEventPoint[];
  challengeRewards: RawLiveEventReward[];
  rewards: RawRewardRow[];
  characters: RawCharacter[];
  bands: RawBand[];
  texts: RawText[];
}

export interface EventSources {
  cards: CardViewModel[];
  supportCards: SupportCardViewModel[];
  music: MusicViewModel[];
  stories: StoryViewModel[];
}

/** List summary. Detail pages receive {@link EventDetailViewModel}. */
export interface EventViewModel {
  id: number;
  name: string;
  startAt: string;
  endAt: string;
  displayEndAt: string;
  /** 7:3 artwork with the logo: the event story chapter's banner. Empty when the event has no story. */
  bannerUrl: string;
  logoUrl: string;
  backgroundUrl: string;
  /** Bands and characters the bonuses and the event's cards favour, for the list filters and faces. */
  bandIds: number[];
  characters: EventCharacter[];
  searchText: string;
}

export interface EventCharacter {
  id: number;
  name: string;
}

export type EventCardKind = "member" | "support";
export type EventBonusTargetKind = "member" | "support" | "character" | "band" | "attribute" | "tag" | "any";

export interface EventBonusTarget {
  kind: EventBonusTargetKind;
  id: number;
  /** Empty for attributes, tags and "any card"; the page names those. */
  name: string;
  imageUrl: string;
  link?: RewardViewModel["link"];
}

export interface EventBonus {
  target: EventBonusTarget;
  /** Percent at card rank 1–5 (member cards: Awaken, support cards: Limit Break); null when the bonus has no such part. */
  parameter: number[] | null;
  /** Extra event items a live yields, in percent at card rank 1–5. */
  eventItem: number[] | null;
}

export interface EventBonusGroup {
  cardKind: EventCardKind;
  bonuses: EventBonus[];
}

export interface EventStoryEpisode {
  advId: number;
  title: string;
  episodeNumber: number | null;
  kind: StoryEpisodeKind | null;
  /** Event points that unlock the episode. */
  eventPoint: number;
  imageUrl: string;
}

export interface EventPointReward {
  point: number;
  rewards: RewardViewModel[];
}

export interface EventLoopReward {
  from: number;
  every: number;
  rewards: RewardViewModel[];
}

export interface EventLiveRow {
  scoreRank: number;
  /** "D" … "SS". */
  label: string;
  point: number | null;
  rewards: Array<RewardViewModel & { probability: number }>;
}

export interface EventDetailViewModel extends EventViewModel {
  eventItem: RewardViewModel | null;
  music: MusicViewModel | null;
  /** The event's own cards (MasterEventPickUpCard). */
  cards: CardViewModel[];
  supportCards: SupportCardViewModel[];
  bonusGroups: EventBonusGroup[];
  chapterName: string;
  chapterDescription: string;
  story: EventStoryEpisode[];
  pointRewards: EventPointReward[];
  loopReward: EventLoopReward | null;
  live: EventLiveRow[];
  challengeLive: EventLiveRow[];
  rankings: { score: boolean; music: boolean; totalMusic: boolean };
}

// MasterEventEffect.resourceTypeConstraint and MasterEventPickUpCard.resourceType (MasterData resourceType).
const RESOURCE_MEMBER = 2;
const RESOURCE_SUPPORT = 3;
const RESOURCE_ITEM = 1;
// MasterEventEffect.eventBonusType: 0 member parameters, 1 support card parameters, 2 event items.
const BONUS_EVENT_ITEM = 2;

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

function eventImageUrl(asset: string, locale: AppLocale): string {
  return asset ? getImageAssetUrl(`Image/Event/${asset}`, locale) : "";
}

function effectValues(effect: RawEventEffect): number[] {
  return [effect.rank1EffectValue, effect.rank2EffectValue, effect.rank3EffectValue, effect.rank4EffectValue, effect.rank5EffectValue].map((value) => value / 100);
}

function targetKey(effect: RawEventEffect): string {
  return [effect.resourceTypeConstraint, effect.memberCardId, effect.supportCardId, effect.characterId, effect.bandId, effect.cardType, effect.tagId].join(":");
}

export function normalizeEvents(data: EventMasterData, sources: EventSources, resolve: RewardResolver, locale: AppLocale): EventDetailViewModel[] {
  const textMap = new Map(data.texts.map((entry) => [entry.id, entry]));
  const text = (id: string) => localizeMasterText(textMap.get(id), locale);
  const cards = new Map(sources.cards.map((card) => [card.id, card]));
  const supportCards = new Map(sources.supportCards.map((card) => [card.id, card]));
  const music = new Map(sources.music.map((song) => [song.id, song]));
  const characters = new Map(data.characters.map((character) => [character.id, character]));
  const bands = new Map(data.bands.map((band) => [band.id, band]));
  const rewardRows = new Map(data.rewards.map((row) => [row.id, row]));
  const effectsByEvent = groupBy(data.effects, (effect) => effect.eventId);
  const pickUpsByEvent = groupBy(data.pickUpCards, (card) => card.eventId);
  const achievementsByEvent = groupBy(data.achievementRewards, (reward) => reward.eventId);
  const loopsByEvent = new Map(data.loopRewards.map((reward) => [reward.eventId, reward]));
  const storiesByChapter = groupBy(sources.stories.filter((story) => story.category === "main" && story.chapterId !== null), (story) => story.chapterId);

  const rewardsOf = (ids: number[]) => ids.flatMap((id) => {
    const row = rewardRows.get(id);
    return row ? [resolve(row)] : [];
  });

  const target = (effect: RawEventEffect): EventBonusTarget => {
    if (effect.memberCardId) {
      const card = cards.get(effect.memberCardId);
      return { kind: "member", id: effect.memberCardId, name: card ? `${card.characterName} · ${card.title}` : "", imageUrl: card ? getCardThumbnailUrl(card.assetId) : "", link: { routeId: "cards", detailId: effect.memberCardId } };
    }
    if (effect.supportCardId) {
      const card = supportCards.get(effect.supportCardId);
      return { kind: "support", id: effect.supportCardId, name: card ? `${card.name} · ${card.title}` : "", imageUrl: card ? getSupportCardThumbnailUrl(card.assetId) : "", link: { routeId: "support-cards", detailId: effect.supportCardId } };
    }
    if (effect.characterId) {
      return { kind: "character", id: effect.characterId, name: text(characters.get(effect.characterId)?.nameTextID ?? ""), imageUrl: getCharacterFaceIconUrl(effect.characterId), link: { routeId: "characters", detailId: effect.characterId } };
    }
    if (effect.bandId) {
      return { kind: "band", id: effect.bandId, name: text(bands.get(effect.bandId)?.nameTextID ?? ""), imageUrl: getBandLogoUrl(effect.bandId, locale) };
    }
    if (effect.cardType) {
      return { kind: "attribute", id: effect.cardType, name: "", imageUrl: [1, 2, 3, 4, 5].includes(effect.cardType) ? getCardTypeIconUrl(effect.cardType as CardType) : "" };
    }
    if (effect.tagId) return { kind: "tag", id: effect.tagId, name: "", imageUrl: "" };
    return { kind: "any", id: 0, name: "", imageUrl: "" };
  };

  const bonusGroups = (effects: RawEventEffect[]): EventBonusGroup[] => {
    const groups: EventBonusGroup[] = [];
    for (const [cardKind, resourceType] of [["member", RESOURCE_MEMBER], ["support", RESOURCE_SUPPORT]] as const) {
      // A target's parameter and event-item bonuses are separate rows; show them side by side.
      const byTarget = new Map<string, EventBonus>();
      for (const effect of effects.filter((row) => row.resourceTypeConstraint === resourceType).sort((a, b) => a.id - b.id)) {
        const key = targetKey(effect);
        const bonus = byTarget.get(key) ?? { target: target(effect), parameter: null, eventItem: null };
        if (effect.eventBonusType === BONUS_EVENT_ITEM) bonus.eventItem = effectValues(effect);
        else bonus.parameter = effectValues(effect);
        byTarget.set(key, bonus);
      }
      if (byTarget.size) groups.push({ cardKind, bonuses: [...byTarget.values()] });
    }
    return groups;
  };

  const liveRows = (points: RawLiveEventPoint[], rewards: RawLiveEventReward[], pointGroup: number, rewardGroup: number): EventLiveRow[] => {
    const pointByRank = new Map(points.filter((row) => row.group === pointGroup).map((row) => [row.scoreRank, row.value]));
    const rewardsByRank = groupBy(rewards.filter((row) => row.eventGroup === rewardGroup), (row) => row.scoreRank);
    return [...new Set([...pointByRank.keys(), ...rewardsByRank.keys()])]
      .sort((a, b) => a - b)
      .map((scoreRank) => ({
        scoreRank,
        label: scoreRankLabel(scoreRank),
        point: pointByRank.get(scoreRank) ?? null,
        rewards: (rewardsByRank.get(scoreRank) ?? []).sort((a, b) => a.id - b.id).map((row) => ({ ...resolve(row), probability: row.probability / 100 })),
      }));
  };

  return data.events
    .map((event): EventDetailViewModel => {
      const effects = effectsByEvent.get(event.id) ?? [];
      const pickUps = pickUpsByEvent.get(event.id) ?? [];
      const episodes = (storiesByChapter.get(event.storyChapterId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
      const chapter = episodes[0];
      const eventCards = pickUps.filter((row) => row.resourceType === RESOURCE_MEMBER).flatMap((row) => cards.get(row.resourceId) ?? []);
      const eventSupportCards = pickUps.filter((row) => row.resourceType === RESOURCE_SUPPORT).flatMap((row) => supportCards.get(row.resourceId) ?? []);
      const bonusCards = effects.flatMap((effect) => cards.get(effect.memberCardId) ?? []);
      const bonusSupportCards = effects.flatMap((effect) => supportCards.get(effect.supportCardId) ?? []);
      const characterIds = [...new Set([
        ...effects.map((effect) => effect.characterId),
        ...[...eventCards, ...bonusCards].map((card) => card.characterId),
        ...[...eventSupportCards, ...bonusSupportCards].flatMap((card) => card.characterIds),
      ].filter(Boolean))];
      const bandIds = [...new Set([
        ...effects.map((effect) => effect.bandId),
        ...characterIds.map((id) => characters.get(id)?.bandID ?? 0),
      ].filter(Boolean))];
      const eventCharacters = characterIds.map((id) => ({ id, name: text(characters.get(id)?.nameTextID ?? "") }));
      const name = text(event.nameTextId) || chapter?.chapterName || `#${event.id}`;
      const song = music.get(event.musicId) ?? null;
      const loop = loopsByEvent.get(event.id);

      return {
        id: event.id,
        name,
        startAt: event.startAt,
        endAt: event.endAt,
        displayEndAt: event.displayEndAt,
        bannerUrl: chapter?.chapterBanner ? getAssetUrl({ path: `Story/Banner/Chapter/${chapter.chapterBanner}.png`, type: "raw", locale }) : "",
        logoUrl: eventImageUrl(event.logoAsset, locale),
        backgroundUrl: eventImageUrl(event.backgroundAsset, locale),
        bandIds,
        characters: eventCharacters,
        searchText: [...new Set([name, chapter?.chapterName, song?.title, ...eventCharacters.map((character) => character.name)].filter(Boolean))].join(" ").toLocaleLowerCase(),
        eventItem: event.eventItemId ? resolve({ resourceType: RESOURCE_ITEM, resourceId: event.eventItemId, resourceCount: 1 }) : null,
        music: song,
        cards: eventCards,
        supportCards: eventSupportCards,
        bonusGroups: bonusGroups(effects),
        chapterName: chapter?.chapterName ?? "",
        chapterDescription: chapter?.chapterDescription ?? "",
        story: episodes.map((story) => ({
          advId: story.advId,
          title: story.title,
          episodeNumber: story.episodeNumber,
          kind: story.episodeKind,
          eventPoint: story.unlock.eventPoint,
          imageUrl: story.assets.banner ? getAssetUrl({ path: `Story/Banner/Episode/${story.assets.banner}.png`, type: "raw", locale }) : "",
        })),
        pointRewards: (achievementsByEvent.get(event.id) ?? [])
          .sort((a, b) => a.eventPoint - b.eventPoint || a.id - b.id)
          .map((reward) => ({ point: reward.eventPoint, rewards: rewardsOf(reward.rewardIds) })),
        loopReward: loop ? { from: loop.loopStartEventPoint, every: loop.loopEventPoint, rewards: rewardsOf(loop.rewardIds) } : null,
        live: liveRows(data.livePoints, data.liveRewards, event.liveEventPointGroup, event.liveEventRewardGroup),
        challengeLive: liveRows(data.challengePoints, data.challengeRewards, event.challengeLiveEventPointGroup, event.challengeLiveEventRewardGroup),
        rankings: { score: !event.isRankingDisabled, music: !event.isMusicRankingDisabled, totalMusic: !event.isTotalMusicRankingDisabled },
      };
    })
    .sort((a, b) => b.id - a.id);
}

export function toEventSummary(event: EventDetailViewModel): EventViewModel {
  return {
    id: event.id,
    name: event.name,
    startAt: event.startAt,
    endAt: event.endAt,
    displayEndAt: event.displayEndAt,
    bannerUrl: event.bannerUrl,
    logoUrl: event.logoUrl,
    backgroundUrl: event.backgroundUrl,
    bandIds: event.bandIds,
    characters: event.characters,
    searchText: event.searchText,
  };
}

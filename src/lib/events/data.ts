import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl, getAssetUrl } from "@/lib/assets/url";
import { getBandLogoUrl, getCardThumbnailUrl, getCardTypeIconUrl, getCharacterFaceIconUrl, type CardType } from "@/lib/cards/assets";
import type { CardViewModel, RawBand, RawCharacter, RawText } from "@/lib/cards/data";
import { t } from "@/i18n";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { MusicViewModel } from "@/lib/music/data";
import type { RawRewardRow } from "@/lib/rewards/data";
import { describeMission, scoreRankLabel, type MissionDescribeContext } from "@/lib/missions/describe";
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

/** MasterEventMission: one event screen mission (played with event items) and its reward rows. */
export interface RawEventMission {
  id: number;
  eventMissionGroupId: number;
  descriptionTextId: string;
  missionType: number;
  achievementCount: number;
  value: number;
  characterId: number;
  bandId: number;
  musicId: number;
  musicDifficulty: number;
  scoreRank: number;
  cardType: number;
  storyChapterId: number;
  episodeId: number;
  exchangeId: number;
  priority: number;
  missionRewardIds: number[];
}

/** Raw lookup rows the event missions' description placeholders borrow from other tables. */
export interface EventMissionLookups {
  exchanges: Array<{ id: number; nameTextId: string }>;
  chapters: Array<{ id: number; nameTextId: string }>;
  episodes: Array<{ id: number; episodeNumber: number; advId: number }>;
  advs: Array<{ id: number; nameTextId: string }>;
}

/** MasterEventBoxGacha: an event's box gacha (each draw costs event items). */
export interface RawEventBoxGacha {
  id: number;
  eventId: number;
  eventBoxGachaType: number;
  eventItemCost: number;
}

/** MasterEventBoxGachaReward: a tier (or loop tier) of a box gacha's rewards. */
export interface RawEventBoxGachaReward {
  id: number;
  eventBoxGachaId: number;
  eventBoxGachaTier: number;
  eventBoxGachaRewardCount: number;
  eventBoxGachaRewardProbability: number;
  rewardIds: number[];
}

/** MasterEventRankingReward: what an event ranking tier (rankStart..rankEnd) earns. */
export interface RawEventRankingReward {
  id: number;
  eventId: number;
  rankStart: number;
  rankEnd: number;
  rewardIds: number[];
}

/** MasterChallengeMusic: a song an event's Challenge Live ranks separately. */
export interface RawChallengeMusic {
  id: number;
  eventId: number;
  /** MasterLiveMusic id. */
  liveMusicId: number;
  musicType: number;
  /** Gekisou (rush) mission targets, 0 when the table leaves them unset. */
  gekisouMission1: number;
  gekisouMission2: number;
  gekisouMission3: number;
  rankingRewardGroup: number;
}

/** MasterChallengeMusicBoostBonus: challenge point spend multipliers, shown on the Challenge Live page. */
export interface RawChallengeMusicBoostBonus {
  id: number;
  consumedChallengePointCount: number;
  eventPointRate: number;
  liveMusicRewardRate: number;
}

/** MasterChallengeMusicRankingReward: what one Challenge Live song ranking tier earns. */
export interface RawChallengeMusicRankingReward {
  id: number;
  group: number;
  rankStart: number;
  rankEnd: number;
  rewardIds: number[];
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
  eventMissions: RawEventMission[];
  missionLookups: EventMissionLookups;
  boxGachas: RawEventBoxGacha[];
  boxGachaRewards: RawEventBoxGachaReward[];
  rankingRewards: RawEventRankingReward[];
  challengeMusic: RawChallengeMusic[];
  challengeBoostBonuses: RawChallengeMusicBoostBonus[];
  challengeMusicRankingRewards: RawChallengeMusicRankingReward[];
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
  /** Gachas, lots and prizes, for the gachas featuring the event's cards; optional (no related gachas without it). */
  gachas?: EventGachaSources;
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

/** One event mission row of the "Event missions" panel. */
export interface EventMissionRow {
  id: number;
  description: string;
  rewards: RewardViewModel[];
}

/** One reward in a box gacha tier, resolved; `count` is copies in the box, `probability` their combined weight (percent). */
export type EventBoxGachaItem = RewardViewModel & { count: number; probability: number };

export interface EventBoxGachaTier {
  tier: number;
  items: EventBoxGachaItem[];
}

export interface EventBoxGachaBox extends EventBoxGachaTier {
  cost: number;
}

export interface EventBoxGachaSection {
  /** Reward of the event item pulls cost, so the UI can name it; null when cost is 0. */
  item: RewardViewModel | null;
  boxes: EventBoxGachaBox[];
  loop: EventBoxGachaTier | null;
}

/** One ranking tier (event score ranking, or one Challenge Live song's ranking). */
export interface EventRankingTier {
  rankStart: number;
  rankEnd: number;
  rewards: RewardViewModel[];
}

export interface EventChallengeSong {
  id: number;
  musicType: number;
  music: MusicViewModel | null;
  /** Gekisou mission targets, [] when the table leaves them at 0. */
  missions: number[];
  ranking: EventRankingTier[];
}

export interface EventChallengeLive {
  boosts: Array<{ challengePoint: number; eventPointRate: number; rewardRate: number }>;
  songs: EventChallengeSong[];
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
  missions: EventMissionRow[];
  boxGacha: EventBoxGachaSection | null;
  rankingRewards: EventRankingTier[];
  challengeMusic: EventChallengeLive | null;
  /** Gachas featuring the event's cards (see relatedGachas); empty when no gacha does. */
  relatedGachas: EventRelatedGacha[];
}

// MasterEventEffect.resourceTypeConstraint and MasterEventPickUpCard.resourceType (MasterData resourceType).
const RESOURCE_MEMBER = 2;
const RESOURCE_SUPPORT = 3;
const RESOURCE_ITEM = 1;
// MasterEventEffect.eventBonusType: 0 member parameters, 1 support card parameters, 2 event items.
const BONUS_EVENT_ITEM = 2;
// MasterEventBoxGacha.eventBoxGachaType 1 is the never-empty loop box after the numbered boxes.
const LOOP_BOX_GACHA_TYPE = 1;
// MasterGachaPrize.pickUpType of the rate-up prizes.
const PICKUP_RATE_UP = 2;

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
  const missionsByGroup = groupBy(data.eventMissions, (row) => row.eventMissionGroupId);
  const boxGachasByEvent = groupBy(data.boxGachas, (row) => row.eventId);
  const boxRewardsByGacha = groupBy(data.boxGachaRewards, (row) => row.eventBoxGachaId);
  const rankingRewardsByEvent = groupBy(data.rankingRewards, (row) => row.eventId);
  const challengeMusicByEvent = groupBy(data.challengeMusic, (row) => row.eventId);
  const challengeRankingByGroup = groupBy(data.challengeMusicRankingRewards, (row) => row.group);

  // Event missions word their target by placeholder ({AchievementCount}, {MusicId}, …), like rewards/data.ts describe does.
  const missionLookups = data.missionLookups;
  const missionNames = (rows: Array<{ id: number; nameTextId?: string; nameTextID?: string }>) =>
    new Map(rows.map((row) => [row.id, text(row.nameTextId ?? row.nameTextID ?? "")]));
  const missionExchanges = missionNames(missionLookups.exchanges);
  const missionChapters = missionNames(missionLookups.chapters);
  const missionBands = new Map(data.bands.map((band) => [band.id, text(band.nameTextID)]));
  const missionCharacters = new Map(data.characters.map((character) => [character.id, text(character.nameTextID)]));
  const missionEpisodes = new Map(missionLookups.episodes.map((episode) => [episode.id, episode]));
  const missionAdvs = new Map(missionLookups.advs.map((adv) => [adv.id, text(adv.nameTextId)]));
  const missionMusic = new Map(sources.music.map((song) => [song.id, song.title]));
  const missionDifficulty = [1, 2, 3, 4].map((value) => t(locale, `music.difficulties.${value}`));
  // Placeholder filling is shared with rewards/data.ts (lib/missions/describe.ts); only the lookups differ.
  const missionContext: MissionDescribeContext = {
    locale,
    text,
    exchangeName: (id) => missionExchanges.get(id),
    chapterName: (id) => missionChapters.get(id),
    episode: (id) => {
      const episode = missionEpisodes.get(id);
      return episode ? { number: episode.episodeNumber, title: missionAdvs.get(episode.advId) ?? "" } : undefined;
    },
    bandName: (id) => missionBands.get(id),
    characterName: (id) => missionCharacters.get(id),
    musicTitle: (id) => missionMusic.get(id),
    difficulty: (value) => missionDifficulty[value - 1] ?? "",
  };
  const describeEventMission = (mission: RawEventMission): string => describeMission(mission, missionContext);

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

  const rankingTier = (rows: Array<{ rankStart: number; rankEnd: number; rewardIds: number[] }>): EventRankingTier[] =>
    rows
      .slice()
      .sort((a, b) => a.rankStart - b.rankStart || a.rankEnd - b.rankEnd || a.rewardIds[0]! - b.rewardIds[0]!)
      .map((row) => ({ rankStart: row.rankStart, rankEnd: row.rankEnd, rewards: rewardsOf(row.rewardIds) }));

  const boxGachaSection = (event: RawEvent, gachas: RawEventBoxGacha[]): EventBoxGachaSection | null => {
    const boxes: EventBoxGachaBox[] = [];
    let loop: EventBoxGachaTier | null = null;
    let cost = 0;
    for (const gacha of gachas.slice().sort((a, b) => (a.eventBoxGachaType - b.eventBoxGachaType) || (a.id - b.id))) {
      cost ||= gacha.eventItemCost;
      const items = (boxRewardsByGacha.get(gacha.id) ?? [])
        .slice()
        .sort((a, b) => a.eventBoxGachaTier - b.eventBoxGachaTier)
        .flatMap((row) => rewardsOf(row.rewardIds).flatMap((item) => {
          const probability = row.eventBoxGachaRewardProbability / 100;
          return row.eventBoxGachaRewardCount > 0 && probability > 0 ? [{ ...item, count: row.eventBoxGachaRewardCount, probability }] : [];
        }));
      if (!items.length) continue;
      if (gacha.eventBoxGachaType === LOOP_BOX_GACHA_TYPE) {
        (loop ??= { tier: boxes.length + 1, items: [] }).items.push(...items);
      } else {
        boxes.push({ tier: boxes.length + 1, cost: gacha.eventItemCost, items });
      }
    }
    if (!boxes.length && !loop) return null;
    return { item: cost ? resolve({ resourceType: RESOURCE_ITEM, resourceId: event.eventItemId, resourceCount: cost }) : null, boxes, loop };
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
      const eventMissions = (missionsByGroup.get(event.id) ?? []).sort((a, b) => a.priority - b.priority || a.id - b.id);
      const eventRankingRewards = rankingRewardsByEvent.get(event.id) ?? [];
      const challengeSongs = (challengeMusicByEvent.get(event.id) ?? [])
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((row): EventChallengeSong => ({
          id: row.id,
          musicType: row.musicType,
          music: music.get(row.liveMusicId) ?? null,
          missions: [row.gekisouMission1, row.gekisouMission2, row.gekisouMission3].filter((value) => value > 0),
          ranking: rankingTier(challengeRankingByGroup.get(row.rankingRewardGroup) ?? []),
        }));
      const challengeBoosts = data.challengeBoostBonuses
        .slice()
        .sort((a, b) => a.consumedChallengePointCount - b.consumedChallengePointCount || a.id - b.id)
        .map((row) => ({ challengePoint: row.consumedChallengePointCount, eventPointRate: row.eventPointRate, rewardRate: row.liveMusicRewardRate }));

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
        missions: eventMissions.map((mission) => ({ id: mission.id, description: describeEventMission(mission), rewards: rewardsOf(mission.missionRewardIds) })),
        boxGacha: boxGachaSection(event, boxGachasByEvent.get(event.id) ?? []),
        rankingRewards: rankingTier(eventRankingRewards),
        challengeMusic: challengeSongs.length ? { boosts: challengeBoosts, songs: challengeSongs } : null,
        relatedGachas: sources.gachas ? relatedGachas({ pickUpCards: pickUps, effects }, sources.gachas) : [],
      };
    })
    .sort((a, b) => b.id - a.id);
}

/** A gacha that features one of an event's cards, for the event page's "related gacha" links. */
export interface EventRelatedGacha {
  id: number;
  name: string;
  bannerPath: string;
  startAt: string;
  endAt: string;
  /** The event's cards the gacha features, as `"<resourceType>:<id>"` (2 member, 3 support). */
  cards: string[];
}

/** The gacha rows `relatedGachas` reads: each gacha's lot group, and the prizes of every lot. */
export interface EventGachaSources {
  gachas: Array<{ id: number; name: string; bannerPath: string; startAt: string; endAt: string; lotGroupId: number }>;
  lots: Array<{ lotGroupId: number; prizeGroupId: number }>;
  prizes: Array<{ groupId: number; resourceType: number; resourceId: number; pickUpType: number }>;
}

/**
 * Gachas featuring an event's cards: the cards of MasterEventPickUpCard and of the bonus rows naming one card
 * (MasterEventEffect memberCardId/supportCardId), met among the rate-up prizes (MasterGachaPrize, pickUpType 2) of
 * each gacha's lots. Dates never establish the relation. Newest gacha (highest id) first.
 */
export function relatedGachas(
  event: { pickUpCards: ReadonlyArray<{ resourceType: number; resourceId: number }>; effects: ReadonlyArray<{ memberCardId: number; supportCardId: number }> },
  sources: EventGachaSources,
): EventRelatedGacha[] {
  const targets = new Set<string>();
  for (const card of event.pickUpCards) if (card.resourceType === RESOURCE_MEMBER || card.resourceType === RESOURCE_SUPPORT) targets.add(`${card.resourceType}:${card.resourceId}`);
  for (const effect of event.effects) {
    if (effect.memberCardId) targets.add(`${RESOURCE_MEMBER}:${effect.memberCardId}`);
    if (effect.supportCardId) targets.add(`${RESOURCE_SUPPORT}:${effect.supportCardId}`);
  }
  if (!targets.size) return [];
  const matchesByPrizeGroup = new Map<number, Set<string>>();
  for (const prize of sources.prizes) {
    if (prize.pickUpType !== PICKUP_RATE_UP) continue;
    const key = `${prize.resourceType}:${prize.resourceId}`;
    if (!targets.has(key)) continue;
    const set = matchesByPrizeGroup.get(prize.groupId) ?? new Set<string>();
    set.add(key);
    matchesByPrizeGroup.set(prize.groupId, set);
  }
  if (!matchesByPrizeGroup.size) return [];
  const prizeGroupsByLot = groupBy(sources.lots, (lot) => lot.lotGroupId);
  return sources.gachas
    .flatMap((gacha): EventRelatedGacha[] => {
      const cards = new Set<string>();
      for (const lot of prizeGroupsByLot.get(gacha.lotGroupId) ?? []) for (const key of matchesByPrizeGroup.get(lot.prizeGroupId) ?? []) cards.add(key);
      return cards.size ? [{ id: gacha.id, name: gacha.name, bannerPath: gacha.bannerPath, startAt: gacha.startAt, endAt: gacha.endAt, cards: [...cards].sort() }] : [];
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

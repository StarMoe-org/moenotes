import { createHash } from "node:crypto";
import { GAME_SERVER_PROFILES, PRIMARY_SERVER, type GameServer } from "@/config/servers";
import {
  currentMasterDataEpochSync,
  getBuildManifest,
  getBuildMasterData,
  getBuildMasterVersion,
  isMasterDataManifestFresh,
  type MasterDataReadOptions,
} from "@/lib/masterdata/build-snapshot";

export const DECK_MASTER_OVERLAY_FORMAT = "moenotes.deck-master-overlay/1";

export interface DeckMasterColumnarTable {
  columns: string[];
  rows: unknown[][];
}

export interface DeckMasterOverlayPayload {
  format: typeof DECK_MASTER_OVERLAY_FORMAT;
  server: GameServer;
  region: string;
  dataVersion: string;
  regionVersion: string | null;
  sha256: string;
  master: Record<string, DeckMasterColumnarTable>;
}

interface DeckTableSpec {
  readonly columns: readonly string[];
  readonly optionalColumns?: readonly string[];
  readonly optionalTable?: boolean;
}

/**
 * Exact columnar MasterData projection matching `nnnotes.deck-data/1` (`DeckData.master`) so the browser Deck Worker
 * always evaluates the same live cards, snaps, skills, growth tables, furniture bonuses, and event schedules that
 * Next.js SSR renders, without waiting for an offline replay bundle rebuild.
 */
export const DECK_MASTER_TABLE_SPECS: Readonly<Record<string, DeckTableSpec>> = {
  MasterMemberCard: {
    columns: [
      "_id", "_characterID", "_rarity", "_cardType", "_bestMusicTagIDs",
      "_performancePowerMax", "_technicPowerMax", "_visualPowerMax",
      "_memberCardLevelGroup", "_memberCardAwakeGroup", "_memberCardRankGroup",
      "_leaderSkillID", "_liveSkillID", "_gekisouSkillID",
    ],
  },
  MasterMemberCardLevel: {
    columns: ["_id", "_group", "_level", "_exp", "_performanceRate", "_technicRate", "_visualRate"],
  },
  MasterMemberCardLevelLimit: {
    columns: ["_id", "_rarity", "_awakeCount", "_limitLevel"],
  },
  MasterMemberCardAwake: {
    columns: ["_id", "_group", "_awakeCount", "_performanceRate", "_technicRate", "_visualRate"],
  },
  MasterMemberCardRank: {
    columns: [
      "_id", "_group", "_rank", "_performanceRate", "_technicRate", "_visualRate",
      "_leaderSkillLevel", "_musicTypeBonusRate", "_musicTagBonusRate",
    ],
  },
  MasterSupportCard: {
    columns: [
      "_id", "_characterIDs", "_rarity", "_cardType",
      "_performancePowerMax", "_technicPowerMax", "_visualPowerMax",
      "_supportCardLevelGroup", "_supportCardRankGroup",
      "_supportSkillId01", "_supportSkillId02", "_gekisouSupportSkillId01", "_gekisouSupportSkillId02",
    ],
  },
  MasterSupportCardLevel: {
    columns: ["_id", "_group", "_level", "_exp", "_performanceRate", "_technicRate", "_visualRate"],
  },
  MasterSupportCardRank: {
    columns: [
      "_id", "_group", "_rank", "_limitLevel", "_cardTypeLinkBonusRate",
      "_supportSkill01Level", "_supportSkill02Level", "_gekisouSupportSkill01Level", "_gekisouSupportSkill02Level",
    ],
  },
  MasterCharacter: {
    columns: ["_id", "_bandID", "_isNonPlayable"],
  },
  MasterBand: {
    columns: ["_id"],
  },
  MasterCharacterRank: {
    columns: ["_id", "_rank", "_exp", "_bonus"],
  },
  MasterCharacterTotalRank: {
    columns: ["_id", "_totalRank", "_bonus"],
  },
  MasterBandItemSkillEffect: {
    columns: ["_id", "_bandItemId", "_level", "_skillTargetIDs", "_skillEffectType", "_effectValue"],
  },
  MasterBandItem: {
    columns: ["_id", "_bandId"],
  },
  MasterBandItemLevel: {
    columns: ["_id", "_bandItemId", "_level", "_playerRank"],
  },
  MasterVip: {
    columns: ["_id", "_vipRank"],
  },
  MasterVipRankBonus: {
    columns: ["_id", "_vipRank", "_vipBonusType", "_value"],
  },
  MasterMemoryMusicGroup: {
    columns: ["_id", "_skillTargetIds"],
  },
  MasterMemoryMusic: {
    columns: ["_id", "_groupId"],
  },
  MasterMemoryMusicBonus: {
    columns: ["_id", "_groupId", "_scoreRank", "_performance", "_technic", "_visual"],
  },
  MasterMemoryMemberLevel: {
    columns: ["_id", "_point", "_performance", "_technic", "_visual"],
  },
  MasterMemorySupportLevel: {
    columns: ["_id", "_point", "_performance", "_technic", "_visual"],
  },
  MasterSkillTarget: {
    columns: [
      "_id", "_skillTargetType", "_characterID", "_bandID", "_cardType", "_tagID",
      "_judgement", "_liveMusicType", "_gekisouMissionType", "_liveSkillCategories", "_gekisouSkillCategories",
    ],
  },
  MasterSkillCondition: {
    columns: ["_id", "_conditionType", "_conditionValues", "_isPositive", "_conditionTargetIDs"],
  },
  MasterSkillConditionSet: {
    columns: ["_id", "_group", "_conditionIds"],
  },
  MasterSkillCumulativeCondition: {
    columns: ["_id", "_skillCumulativeConditionType", "_conditionValues", "_conditionTargetIDs", "_maxCumulativeCount"],
  },
  MasterSkillEffectSetting: {
    columns: ["_id", "_skillEffectType", "_phase"],
  },
  MasterLeaderSkillEffect: {
    columns: [
      "_id", "_leaderSkillID", "_level", "_skillConditionGroup", "_skillTargetIDs",
      "_skillEffectType", "_effectValue", "_skillCumulativeConditionID",
    ],
  },
  MasterLiveSkill: {
    columns: ["_id", "_skillCategories"],
  },
  MasterLiveSkillEffect: {
    columns: [
      "_id", "_liveSkillID", "_level", "_skillConditionGroup", "_skillReleaseConditionGroup",
      "_skillTargetIDs", "_skillEffectType", "_activationTimeSecond", "_effectValue", "_maxEffectValue",
      "_effectLimitCount", "_skillCumulativeConditionID", "_effectExecuteLimitCount",
      "_effectExecuteLimitResetConditionGroup",
    ],
  },
  MasterSupportSkill: {
    columns: ["_id"],
  },
  MasterSupportSkillEffect: {
    columns: [
      "_id", "_supportSkillID", "_level", "_skillTriggerConditionGroup", "_skillTriggerType",
      "_skillConditionGroup", "_skillReleaseConditionGroup", "_skillTargetIDs", "_skillEffectType",
      "_activationTimeSecond", "_effectValue", "_maxEffectValue", "_effectLimitCount",
      "_skillCumulativeConditionID", "_effectExecuteLimitCount", "_effectExecuteLimitResetConditionGroup",
    ],
  },
  MasterGekisouSkill: {
    columns: ["_id", "_gekisouMissionType", "_skillCategories"],
  },
  MasterGekisouSkillEffect: {
    columns: [
      "_id", "_gekisouSkillID", "_level", "_skillTriggerConditionGroup", "_skillTriggerType",
      "_skillConditionGroup", "_skillReleaseConditionGroup", "_skillTargetIDs", "_skillEffectType",
      "_activationTimeSecond", "_effectValue", "_maxEffectValue", "_effectLimitCount",
      "_skillCumulativeConditionID", "_effectExecuteLimitCount", "_effectExecuteLimitResetConditionGroup",
    ],
  },
  MasterGekisouSupportSkill: {
    columns: ["_id", "_gekisouSupportSkillExecTiming", "_gekisouMissionType"],
  },
  MasterGekisouSupportSkillEffect: {
    columns: [
      "_id", "_gekisouSupportSkillID", "_level", "_skillTriggerConditionGroup", "_skillTriggerType",
      "_skillConditionGroup", "_skillReleaseConditionGroup", "_skillTargetIDs", "_skillEffectType",
      "_activationTimeSecond", "_effectValue", "_maxEffectValue", "_effectLimitCount",
      "_skillCumulativeConditionID", "_effectExecuteLimitCount", "_effectExecuteLimitResetConditionGroup",
    ],
  },
  MasterLiveNoteParameter: {
    columns: ["_id", "_noteOperateType", "_scorePercent"],
  },
  MasterLiveJudgementParameter: {
    columns: ["_id", "_noteSimulateJudgement", "_scorePercent", "_damage"],
  },
  MasterLiveJudgementTiming: {
    columns: [
      "_id", "_assistLevel", "_judgementPriority", "_noteJudgementType",
      "_noteSimulateJudgement", "_beforeMs", "_afterMs",
    ],
  },
  MasterLiveComboScoreBonus: {
    columns: ["_id", "_comboBonusType", "_requiredComboCount", "_bonusFactor"],
  },
  MasterLiveSettings: {
    columns: ["_id", "_key", "_value", "_subValue"],
  },
  MasterParameter: {
    columns: ["_id", "_type", "_value"],
  },
  MasterLiveGekisouLuckBasePoint: {
    columns: ["_id", "_noteCategory", "_noteSimulateJudgement", "_weight", "_basePoint"],
  },
  MasterLiveGekisouLuckBonusLot: {
    columns: ["_id", "_chanceLotType", "_lotResult", "_weight"],
  },
  MasterLiveGekisouRankingScoreBonus: {
    columns: ["_id", "_missionPattern", "_rank", "_count", "_scoreBonusPercent"],
  },
  MasterLiveMusic: {
    columns: [
      "_id", "_musicType", "_bestMusicTagIDs", "_liveScoreRankGroup",
      "_easyID", "_normalID", "_hardID", "_expertID",
      "_gekisouMission1", "_gekisouMission2", "_gekisouMission3", "_bandIDs",
    ],
    optionalColumns: ["_bandID"],
  },
  MasterLiveMusicScore: {
    columns: ["_id", "_musicScoreTextFileName", "_musicScoreLevel", "_fullComboCount"],
  },
  MasterArenaMusic: {
    columns: ["_id"],
    optionalColumns: ["_liveMusicId", "_gekisouMission1", "_gekisouMission2", "_gekisouMission3"],
    optionalTable: true,
  },
  MasterChallengeMusic: {
    columns: [
      "_id", "_eventId", "_liveMusicId", "_musicType",
      "_gekisouMission1", "_gekisouMission2", "_gekisouMission3",
      "_rankingRewardGroup", "_stratAt", "_endAt",
    ],
  },
  MasterLiveScoreRank: {
    columns: ["_id", "_group", "_liveScoreRank", "_requiredScore", "_battleLiveRequiredScore"],
  },
  MasterEvent: {
    columns: [
      "_id", "_nameTextId", "_startAt", "_endAt", "_displayEndAt", "_eventType",
      "_storyChapterId", "_eventItemId", "_isRankingDisabled", "_isMusicRankingDisabled",
      "_isTotalMusicRankingDisabled", "_liveEventRewardGroup", "_liveEventPointGroup",
      "_challengeLiveEventRewardGroup", "_challengeLiveEventPointGroup",
      "_gekisouLiveRankingEventPointGroup", "_gekisouLiveRankingEventRewardGroup",
      "_musicId", "_imageAsset", "_logoAsset", "_backgroundAsset", "_bannerAsset",
      "_backgroundVideoAsset", "_carouselHelpId",
    ],
  },
  MasterEventEffect: {
    columns: [
      "_id", "_eventId", "_resourceTypeConstraint", "_characterId", "_bandId", "_cardType",
      "_tagId", "_memberCardId", "_supportCardId", "_eventBonusType",
      "_rank1EffectValue", "_rank2EffectValue", "_rank3EffectValue", "_rank4EffectValue", "_rank5EffectValue",
    ],
  },
  MasterEventAchievementReward: {
    columns: ["_id", "_eventId", "_eventPoint", "_rewardIds"],
  },
  MasterEventAchievementLoopReward: {
    columns: ["_id", "_eventId", "_loopStartEventPoint", "_loopEventPoint", "_rewardIds"],
  },
  MasterLiveEventReward: {
    columns: ["_id", "_group", "_eventGroup", "_scoreRank", "_resourceType", "_resourceId", "_resourceCount", "_probability"],
  },
  MasterChallengeLiveEventReward: {
    columns: ["_id", "_group", "_eventGroup", "_scoreRank", "_resourceType", "_resourceId", "_resourceCount", "_probability"],
  },
  MasterLiveEventPoint: {
    columns: ["_id", "_group", "_scoreRank", "_value"],
  },
  MasterChallengeLiveEventPoint: {
    columns: ["_id", "_group", "_scoreRank", "_value"],
  },
  MasterLiveChallengePoint: {
    columns: ["_id", "_scoreRank", "_value"],
  },
  MasterLiveMusicBoostBonus: {
    columns: [
      "_id", "_consumedLiveBoostCount", "_liveMusicRewardRate",
      "_playerExpRate", "_memberCardExpRate", "_friendshipExpRate", "_eventPointRate",
    ],
  },
  MasterChallengeMusicBoostBonus: {
    columns: [
      "_id", "_consumedChallengePointCount", "_playerExpRate",
      "_memberCardExpRate", "_friendshipExpRate", "_eventPointRate", "_liveMusicRewardRate",
    ],
  },
};

function parseRawMasterRows(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid MasterData table container");
  }
  const allData = (raw as { _allData?: unknown })._allData;
  if (!Array.isArray(allData)) {
    throw new Error("MasterData table is missing _allData array");
  }
  return allData.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row));
}

export function projectDeckMasterTable(
  spec: DeckTableSpec,
  rawRows: readonly Record<string, unknown>[],
): DeckMasterColumnarTable {
  const presentOptional = (spec.optionalColumns ?? []).filter((col) =>
    rawRows.some((row) => Object.prototype.hasOwnProperty.call(row, col)),
  );
  const columns = [...spec.columns, ...presentOptional];
  const rows = rawRows.map((row) => columns.map((col) => (row[col] === undefined ? null : row[col])));
  return { columns, rows };
}

interface OverlayCacheState {
  epoch: number;
  byRegion: Map<string, Promise<Omit<DeckMasterOverlayPayload, "server">>>;
}

const overlayCacheKey = Symbol.for("moenotes.masterdata.deck-master-overlay.v1");
const globalOverlayState = globalThis as typeof globalThis & { [overlayCacheKey]?: OverlayCacheState };
const cacheState = globalOverlayState[overlayCacheKey] ??= { epoch: -1, byRegion: new Map() };

const BATCH_SIZE = 4;

async function buildRegionOverlay(
  server: GameServer,
  options?: MasterDataReadOptions,
): Promise<Omit<DeckMasterOverlayPayload, "server">> {
  const manifest = await getBuildManifest(options);
  const regionVersion = (await getBuildMasterVersion(server, options)) ?? null;
  const region = GAME_SERVER_PROFILES[server].masterdataRegion;
  const entries = Object.entries(DECK_MASTER_TABLE_SPECS);
  const master: Record<string, DeckMasterColumnarTable> = {};

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const loaded = await Promise.all(
      batch.map(async ([tableName, spec]) => {
        try {
          const rows = await getBuildMasterData(`${tableName}.json`, parseRawMasterRows, server, options);
          return [tableName, projectDeckMasterTable(spec, rows)] as const;
        } catch (error) {
          if (spec.optionalTable) return null;
          throw error;
        }
      }),
    );
    for (const item of loaded) {
      if (item) master[item[0]] = item[1];
    }
  }

  const sha256 = createHash("sha256").update(JSON.stringify(master)).digest("hex");
  return {
    format: DECK_MASTER_OVERLAY_FORMAT,
    region,
    dataVersion: manifest.dataVersion || "unknown",
    regionVersion,
    sha256,
    master,
  };
}

export async function getDeckMasterOverlay(
  server: GameServer = PRIMARY_SERVER,
  options?: MasterDataReadOptions,
): Promise<DeckMasterOverlayPayload> {
  const forceBypass = Boolean(options?.forceBypass);
  if (!forceBypass && !isMasterDataManifestFresh()) {
    await getBuildManifest();
  }
  const epoch = currentMasterDataEpochSync();
  if (cacheState.epoch !== epoch) {
    cacheState.epoch = epoch;
    cacheState.byRegion.clear();
  }
  const region = GAME_SERVER_PROFILES[server].masterdataRegion;
  let pending = forceBypass ? undefined : cacheState.byRegion.get(region);
  if (!pending) {
    pending = buildRegionOverlay(server, options).catch((error) => {
      cacheState.byRegion.delete(region);
      throw error;
    });
    cacheState.byRegion.set(region, pending);
  }
  const base = await pending;
  return { server, ...base };
}

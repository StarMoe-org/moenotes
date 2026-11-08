/** Moenotes' verified nnnotes snapshot -> the pinned Haneoka engine document. No scoring formulas live here. */
export type Row = Record<string, unknown>;
export interface ColumnarTable { columns: string[]; rows: unknown[][] }
export interface DeckChart {
  scoreId: number;
  notes: { id: number[]; op: number[]; judgementType: number[]; timeMs: number[] };
  skillEvents: { timeMs: number[] };
  fevers: { startMs: number[]; endMs: number[] };
}
export interface DeckData {
  format: "nnnotes.deck-data/1";
  provenance: { region: string; deck: { commit: string }; replay: { musicLengthsMs: Record<string, number> } };
  master: Record<string, ColumnarTable>;
  charts: DeckChart[];
}
export function table(data: DeckData, name: string, required: string[] = []): Row[] {
  const t = data.master[name];
  if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows) || new Set(t.columns).size !== t.columns.length
    || required.some(key => !t.columns.includes("_" + key))) throw new Error("haneoka-table:" + name);
  return t.rows.map(row => {
    if (!Array.isArray(row) || row.length !== t.columns.length) throw new Error("haneoka-row:" + name);
    return Object.fromEntries(t.columns.map((key, i) => [key.replace(/^_/, ""), row[i]]));
  });
}
export function optionalTable(data: DeckData, name: string, required: string[] = []): Row[] {
  return data.master[name] === undefined ? [] : table(data, name, required);
}
export function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -2147483648 || value > 2147483647)
    throw new Error("haneoka-integer:" + field);
  return value;
}
const keyed = (rows: Row[], key = "id") => Object.fromEntries(rows.map(row => [String(row[key]), row]));
const stat = (row: Row) => ({ performance: row.performancePowerMax, technique: row.technicPowerMax, visual: row.visualPowerMax });
const growth = {
  memberCardLevels: "MasterMemberCardLevel", memberCardAwake: "MasterMemberCardAwake",
  memberCardRanks: "MasterMemberCardRank", memberCardLevelLimits: "MasterMemberCardLevelLimit",
  supportCardLevels: "MasterSupportCardLevel", supportCardRanks: "MasterSupportCardRank",
  characterRanks: "MasterCharacterRank", characterTotalRanks: "MasterCharacterTotalRank",
};
const reference = {
  targets: "MasterSkillTarget", conditions: "MasterSkillCondition", conditionSets: "MasterSkillConditionSet",
  cumulativeConditions: "MasterSkillCumulativeCondition", effectSettings: "MasterSkillEffectSetting",
};
const tools = {
  liveSettings: "MasterLiveSettings", scoreRanks: "MasterLiveScoreRank", noteParameters: "MasterLiveNoteParameter",
  judgementParameters: "MasterLiveJudgementParameter", judgementTiming: "MasterLiveJudgementTiming",
  comboScoreBonuses: "MasterLiveComboScoreBonus", liveBoostBonuses: "MasterLiveMusicBoostBonus",
  challengeBoostBonuses: "MasterChallengeMusicBoostBonus", gekisouRankingScoreBonuses: "MasterLiveGekisouRankingScoreBonus",
  gekisouLuckBasePoints: "MasterLiveGekisouLuckBasePoint", gekisouLuckBonusLots: "MasterLiveGekisouLuckBonusLot",
};
const runtime = {
  parameters: "MasterParameter", vipRanks: "MasterVip", vipRankBonuses: "MasterVipRankBonus",
  memoryMemberLevels: "MasterMemoryMemberLevel", memorySupportLevels: "MasterMemorySupportLevel",
  memoryMusic: "MasterMemoryMusic", memoryMusicBonuses: "MasterMemoryMusicBonus", memoryMusicGroups: "MasterMemoryMusicGroup",
};
const eventTables = ["MasterLiveEventPoint", "MasterChallengeLiveEventPoint", "MasterLiveEventReward", "MasterChallengeLiveEventReward"];
export function adaptData(data: DeckData, datasetId: string) {
  if (data.format !== "nnnotes.deck-data/1" || !["jp", "tw", "kr", "en", "intl"].includes(data.provenance?.region)
    || !/^[a-f0-9]{64}$/.test(datasetId)) throw new Error("haneoka-dataset");
  const rows = (name: string, fields: string[] = []) => table(data, name, fields);
  const characters = keyed(rows("MasterCharacter", ["id", "bandID", "isNonPlayable"]).map(row => ({ ...row, characterId: row.id, bandId: row.bandID })));
  const members = keyed(rows("MasterMemberCard", ["id", "characterID", "memberCardLevelGroup", "memberCardAwakeGroup", "memberCardRankGroup",
    "leaderSkillID", "liveSkillID", "gekisouSkillID", "performancePowerMax", "technicPowerMax", "visualPowerMax"]).map(row => ({
    ...row, characterId: row.characterID, bandId: characters[String(row.characterID)]?.bandId,
    attribute: row.cardType, bestMusicTagIds: row.bestMusicTagIDs, statMax: stat(row),
    levelGroup: row.memberCardLevelGroup, trainingGroup: row.memberCardAwakeGroup, awakeningGroup: row.memberCardRankGroup,
    liveSkillId: row.liveSkillID, gekisoSkillId: row.gekisouSkillID, leaderSkillId: row.leaderSkillID,
  })));
  const snapshots = keyed(rows("MasterSupportCard", ["id", "characterIDs", "supportCardLevelGroup", "supportCardRankGroup",
    "supportSkillId01", "supportSkillId02", "gekisouSupportSkillId01", "gekisouSupportSkillId02"]).map(row => ({
    ...row, characterIds: row.characterIDs, attribute: row.cardType, statMax: stat(row),
    levelGroup: row.supportCardLevelGroup, awakeningGroup: row.supportCardRankGroup,
    supportSkillIds: [row.supportSkillId01, row.supportSkillId02],
    gekisoSupportSkillIds: [row.gekisouSupportSkillId01, row.gekisouSupportSkillId02],
  })));
  function skills(kind: string, parent: string | null, effects: string, key: string) {
    const grouped = new Map<unknown, Row[]>();
    for (const effect of rows(effects, [key])) grouped.set(effect[key], [...grouped.get(effect[key]) ?? [], effect]);
    const parents: Row[] = parent ? rows(parent) : [...grouped.keys()].map(id => ({ id }));
    return [kind, keyed(parents.map(row => ({ ...row, categories: row.skillCategories ?? [], effects: grouped.get(row.id) ?? [] })))];
  }
  const scoreRows = keyed(rows("MasterLiveMusicScore", ["id", "musicScoreLevel", "fullComboCount"]));
  const songs = keyed(rows("MasterLiveMusic", ["id", "musicType", "bestMusicTagIDs", "liveScoreRankGroup"]).map(row => {
    const rawBandIds = Array.isArray(row.bandIDs) ? row.bandIDs : Array.isArray(row.bandIds) ? row.bandIds : null;
    return {
      ...row, musicId: row.id, bestMusicTagIds: row.bestMusicTagIDs,
      ...(rawBandIds ? { bandIds: rawBandIds } : {}),
      difficulty: ["easyID", "normalID", "hardID", "expertID"].flatMap((key, difficulty) => {
        const score = scoreRows[String(row[key])];
        return score ? [{ difficulty, scoreId: score.id, playLevel: score.musicScoreLevel, noteCount: score.fullComboCount }] : [];
      }),
      gekisou: { missionTypes: [row.gekisouMission1, row.gekisouMission2, row.gekisouMission3] },
    };
  }));
  const arenaIds = new Set<number>();
  for (const arena of optionalTable(data, "MasterArenaMusic")) {
    const id = integer(arena.id, "arenaId"), base = songs[String(arena.liveMusicId)];
    if (id <= 0 || !base || arenaIds.has(id) || songs[String(-id)]) throw new Error("haneoka-arena-song");
    arenaIds.add(id);
    const missions = [arena.gekisouMission1, arena.gekisouMission2, arena.gekisouMission3].map((value, i) => {
      const mission = integer(value, "arenaMission");
      if (mission < 0 || mission > 4) throw new Error("haneoka-arena-mission");
      return mission || (base.gekisou as { missionTypes: unknown[] }).missionTypes[i];
    });
    songs[String(-id)] = { ...base, id: -id, musicId: -id, gekisou: { missionTypes: missions } };
  }
  const effects = rows("MasterEventEffect", ["eventId"]);
  const eventRows = Object.fromEntries(eventTables.map(name => [name, rows(name)]));
  const events = keyed(rows("MasterEvent").map(row => ({
    ...row, groups: row, effects: effects.filter(effect => effect.eventId === row.id),
    tables: Object.fromEntries(eventTables.map(name => {
      const group = row[name === "MasterLiveEventPoint" ? "liveEventPointGroup" : name === "MasterChallengeLiveEventPoint"
        ? "challengeLiveEventPointGroup" : name === "MasterLiveEventReward" ? "liveEventRewardGroup" : "challengeLiveEventRewardGroup"];
      return [name, eventRows[name]!.filter(reward => (name.includes("Reward") ? reward.eventGroup : reward.group) === group)];
    })),
  })));
  const memoryFields: Record<string, string[]> = {
    MasterMemoryMemberLevel: ["id", "point", "performance", "technic", "visual"],
    MasterMemorySupportLevel: ["id", "point", "performance", "technic", "visual"],
    MasterMemoryMusicBonus: ["id", "groupId", "scoreRank", "performance", "technic", "visual"],
    MasterMemoryMusic: ["id", "groupId"], MasterMemoryMusicGroup: ["id", "skillTargetIds"],
  };
  for (const [name, fields] of Object.entries(memoryFields)) if (rows(name).length) {
    const seen = new Set<number>();
    for (const row of rows(name, fields)) {
      const id = integer(row.id, name + ".id");
      if (id <= 0 || seen.has(id)) throw new Error("haneoka-memory-id:" + name);
      seen.add(id);
      for (const field of fields.filter(field => field !== "skillTargetIds")) integer(row[field], name + "." + field);
    }
  }
  const itemEffects = rows("MasterBandItemSkillEffect", ["bandItemId", "level"]);
  return {
    schema: "haneoka-team-builder-data-v1", identity: { server: data.provenance.region === "jp" ? "jp" : "intl", releaseId: datasetId },
    masterCharacterRoster: { rows: Object.values(characters) }, characters, members, snapshots, songs, events,
    progression: Object.fromEntries(Object.entries(growth).map(([key, name]) => [key, rows(name)])),
    skills: Object.fromEntries([
      skills("leader", null, "MasterLeaderSkillEffect", "leaderSkillID"),
      skills("live", "MasterLiveSkill", "MasterLiveSkillEffect", "liveSkillID"),
      skills("support", "MasterSupportSkill", "MasterSupportSkillEffect", "supportSkillID"),
      skills("gekiso", "MasterGekisouSkill", "MasterGekisouSkillEffect", "gekisouSkillID"),
      skills("gekisoSupport", "MasterGekisouSupportSkill", "MasterGekisouSupportSkillEffect", "gekisouSupportSkillID"),
    ]),
    skillReference: Object.fromEntries(Object.entries(reference).map(([key, name]) => [key, rows(name)])),
    liveTools: {
      ...Object.fromEntries(Object.entries(tools).map(([key, name]) => [key, rows(name)])),
      judgementAreaOffsets: optionalTable(data, "MasterLiveJudgementAreaOffset"),
    },
    runtimeRules: { tables: Object.fromEntries(Object.entries(runtime).map(([key, name]) => [key, { rows: rows(name) }])) },
    bandItems: keyed(rows("MasterBandItem").map(row => ({ ...row, bandItemId: row.id, effects: itemEffects.filter(effect => effect.bandItemId === row.id) }))),
    challengeMusicTable: { rows: rows("MasterChallengeMusic") }, challengePointTable: { rows: rows("MasterLiveChallengePoint") },
  };
}
export function chartSource(data: DeckData, scoreId: number) {
  const chart = data.charts.find(chart => chart.scoreId === scoreId);
  if (!chart) throw new Error("haneoka-chart:" + scoreId);
  const { notes, skillEvents, fevers } = chart;
  if (![notes.id, notes.op, notes.judgementType].every(values => values.length === notes.timeMs.length)
    || fevers.startMs.length !== fevers.endMs.length) throw new Error("haneoka-chart-shape:" + scoreId);
  const durationMs = data.provenance.replay.musicLengthsMs[String(scoreId)];
  if (!Number.isSafeInteger(durationMs) || durationMs! <= 0) throw new Error("haneoka-chart-duration:" + scoreId);
  return {
    durationMs,
    notes: notes.timeMs.map((timeMs, i) => ({
      timeMs, operateType: notes.op[i], judgementType: notes.judgementType[i],
      judged: ![0, 80, 82, 100, 103, 121, 122, 123].includes(notes.op[i]!),
    })),
    enumeration: notes.timeMs.map((timeMs, i) => ({ timeMs, op: notes.op[i], judgementType: notes.judgementType[i] })),
    skillTimesMs: skillEvents.timeMs, feverMs: fevers.startMs.map((start, i) => [start, fevers.endMs[i]]),
  };
}

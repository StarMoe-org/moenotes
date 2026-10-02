import { buildSnapSkillCatalogue, snapChoiceKey, snapRows } from "./snap-catalogue";
import type { SnapDeckData, SnapEvaluationProfile, SnapReplayEngine, SnapReplayManifest, SnapReplayReference, SnapReplayResource, SnapReplayResult } from "./snap-types";
import type { SnapLabelSource } from "./snap-labels";
import { fetchMusicReplayResource } from "./client";

/** The original player's input-plan helper is injected; this bridge never recreates its algorithm. */
export type SnapInputPlanPreparer = (request: Record<string, unknown>, description: Record<string, unknown>, data: SnapDeckData, profile: SnapEvaluationProfile) => void;
export type SnapEngineFactory = (dataJson: string) => SnapReplayEngine;
export interface LoadedSnapReplay {
  data: SnapDeckData;
  manifestSha256: string;
  dataSha256: string;
  modelCommit: string;
  factory: SnapEngineFactory;
  labelSource?: SnapLabelSource;
}
export class SnapReplayError extends Error {
  constructor(public readonly code: "invalid-profile" | "unsupported" | "needs-context" | "identity" | "accuracy-plan", message: string) { super(message); this.name = "SnapReplayError"; }
}
const invalid = (message: string): never => { throw new SnapReplayError("invalid-profile", message); };
function immutable<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

/** Validate every selection before allocating an engine or producing any scores. */
export function validateSnapProfile(data: SnapDeckData, profile: SnapEvaluationProfile): void {
  if ([profile.selections, profile.pairedMembers, profile.memberSkillPercent, profile.skillOrder].some((slots) => slots.length !== 5)) invalid("Exactly five physical slots are required");
  if (profile.memberSkillPercent.some((value) => !Number.isFinite(value) || value < 0 || value * 100 > 2147483647 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7)) invalid("Skill percent needs a non-negative native factor at 0.01 percent precision");
  if (new Set(profile.skillOrder).size !== 5 || profile.skillOrder.some((i) => !Number.isInteger(i) || i < 0 || i > 4)) invalid("Skill order must preserve all five performer indexes");
  if (!Number.isInteger(profile.power) || profile.power <= 0 || profile.power > 2147483647 || !Number.isInteger(profile.seed) || profile.seed < -2147483648 || profile.seed > 2147483647) invalid("Measurement power and signed native seed are required");
  if (![30, 60, 120].includes(profile.fps) || [profile.greatFraction, profile.justFraction].some((n) => !Number.isFinite(n) || n < 0 || n > 1)) invalid("Invalid declared play plan");
  if (profile.mode.kind !== "normal" && (profile.mode.kind !== "fixedSoloGekisou" || profile.mode.ranks.length !== 3 || profile.mode.ranks.some((r) => !Number.isInteger(r) || r < 1 || r > 5))) invalid("Invalid fixed rank scenario");
  profile.pairedMembers.forEach((member, i) => {
    if (!member) return;
    if (![member.bandId, member.characterId, member.cardType, member.gekisouMissionType].every(Number.isSafeInteger)
      || member.bandId <= 0 || member.characterId <= 0 || member.cardType < 1 || member.cardType > 5
      || [member.tagIds, member.liveSkillCategories, member.gekisouSkillCategories].some((values) => !Array.isArray(values) || values.some((v) => !Number.isSafeInteger(v)))) invalid(`Slot ${i}: member predicates are incomplete`);
    if (!snapRows(data, "MasterCharacter").some((row) => row._id === member.characterId && row._bandID === member.bandId)) invalid(`Slot ${i}: character and band differ from source`);
    if (member.gekisouSkill) {
      const [id, level] = member.gekisouSkill;
      const row = snapRows(data, "MasterGekisouSkill").find((skill) => skill._id === id);
      if (!row || row._gekisouMissionType !== member.gekisouMissionType || JSON.stringify(row._skillCategories) !== JSON.stringify(member.gekisouSkillCategories)
        || !snapRows(data, "MasterGekisouSkillEffect").some((effect) => effect._gekisouSkillID === id && effect._level === level)) invalid(`Slot ${i}: Gekisou predicates differ from its declared skill`);
    }
  });
  const choices = new Map(buildSnapSkillCatalogue(data).map((choice) => [choice.key, choice]));
  profile.selections.forEach((selection, i) => {
    if (!selection) return;
    const choice = choices.get(snapChoiceKey(selection.kind, selection.skillId, selection.level));
    if (!choice || choice.status === "unsupported") throw new SnapReplayError("unsupported", `Slot ${i}: skill is not available for this judged-stream snapshot`);
    const member = profile.pairedMembers[i];
    if (choice.requirements.includes("paired-member") && !member) throw new SnapReplayError("needs-context", `Slot ${i}: paired member predicates are required`);
    if (selection.kind === "gekisou-support" && (profile.mode.kind === "normal" || !member?.gekisouSkill)) throw new SnapReplayError("needs-context", `Slot ${i}: Gekisou mode and paired member Gekisou skill are required`);
  });
}

/** Add declared plain 5s skills to an in-memory copy, retaining all native Snap rules unchanged. */
export function snapProfileData(data: SnapDeckData, profile: SnapEvaluationProfile): SnapDeckData {
  validateSnapProfile(data, profile);
  const plain = snapRows(data, "MasterLiveSkillEffect").find((r) => r._skillEffectType === 2000 && r._activationTimeSecond === 5 && r._skillConditionGroup === 0 && r._skillReleaseConditionGroup === 0 && Array.isArray(r._skillTargetIDs) && r._skillTargetIDs.length === 0 && r._skillCumulativeConditionID === 0);
  if (!plain) throw new SnapReplayError("unsupported", "The source has no plain 5s native skill shape");
  const standardCategories = snapRows(data, "MasterLiveSkill").find((r) => r._id === plain._liveSkillID)?._skillCategories;
  if (!Array.isArray(standardCategories)) throw new SnapReplayError("identity", "The plain skill prototype has no category identity");
  const master = { ...data.master };
  for (const tableName of ["MasterLiveSkill", "MasterLiveSkillEffect"]) {
    const table = data.master[tableName];
    if (!table) throw new SnapReplayError("identity", "Missing live skill table");
    const additions = profile.memberSkillPercent.map((percent, i) => {
      const id = -1000001 - i;
      if (snapRows(data, tableName).some((r) => r._id === id)) throw new SnapReplayError("identity", "Synthetic profile ID collides with source");
      const row = tableName === "MasterLiveSkill" ? { _id: id, _skillCategories: standardCategories }
        : { ...plain, _id: id, _liveSkillID: id, _level: 1, _effectValue: Math.round(percent * 100), _maxEffectValue: 0, _effectLimitCount: 0, _effectExecuteLimitCount: 0, _effectExecuteLimitResetConditionGroup: 0 };
      return table.columns.map((column) => row[column as keyof typeof row]);
    });
    master[tableName] = { columns: table.columns, rows: [...table.rows, ...additions] };
  }
  return { ...data, master };
}

/** Reuse one parsed Rust session for every chart of one declared evaluation context. */
export function createSnapEvaluator(loaded: LoadedSnapReplay, profile: SnapEvaluationProfile, prepareInputPlan?: SnapInputPlanPreparer) {
  // Later UI edits cannot relabel a parsed native session with another profile.
  profile = immutable(structuredClone(profile));
  const derived = snapProfileData(loaded.data, profile);
  if (!prepareInputPlan && (profile.greatFraction !== 0 || profile.justFraction !== 0)) throw new SnapReplayError("accuracy-plan", "The shared input-plan helper is required for Great/Just presets");
  const session = loaded.factory(JSON.stringify(derived));
  return {
    scope: "standard-skill-profile" as const,
    source: { manifestSha256: loaded.manifestSha256, dataSha256: loaded.dataSha256, modelCommit: loaded.modelCommit },
    profile,
    evaluate(scoreId: number): SnapReplayResult {
      const request = JSON.parse(session.template(scoreId, profile.power, profile.fps)) as Record<string, unknown>;
      request.seed = profile.seed;
      request.mode = profile.mode;
      request.skillOrder = [...profile.skillOrder];
      request.performers = profile.pairedMembers.map((member, i) => {
        const selection = profile.selections[i];
        const { memberId: _memberId, ...predicates } = member ?? { bandId: 0, characterId: 0, cardType: 0, tagIds: [], liveSkillCategories: [], gekisouSkillCategories: [], gekisouMissionType: 0, gekisouSkill: null };
        const liveSkillCategories = snapRows(derived, "MasterLiveSkill").find((r) => r._id === -1000001 - i)?._skillCategories;
        return { ...predicates, liveSkillCategories, liveSkill: [-1000001 - i, 1], supportSkills: selection?.kind === "support" ? [[selection.skillId, selection.level]] : [], gekisouSupportSkills: selection?.kind === "gekisou-support" ? [[selection.skillId, selection.level]] : [] };
      });
      if (prepareInputPlan) prepareInputPlan(request, JSON.parse(session.describeChart(scoreId)) as Record<string, unknown>, derived, profile);
      const result = JSON.parse(session.run(JSON.stringify(request))) as SnapReplayResult;
      if (result.format !== "ournotes.replay-result/1" || !result.complete || result.scoreId !== scoreId || !Number.isSafeInteger(result.score) || result.score < 0) throw new SnapReplayError("identity", "Replay did not return a complete matching result");
      return result;
    },
    dispose: () => session.free?.(),
  };
}

async function verified(url: string, identity: Pick<SnapReplayResource, "sha256" | "bytes">, signal?: AbortSignal): Promise<ArrayBuffer> {
  const bytes = await fetchMusicReplayResource(url, signal);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((x) => x.toString(16).padStart(2, "0")).join("");
  if (!/^[0-9a-f]{64}$/.test(identity.sha256) || digest !== identity.sha256 || (identity.bytes !== undefined && bytes.byteLength !== identity.bytes)) throw new SnapReplayError("identity", "Replay resource identity differs from its manifest");
  return bytes;
}

/** Worker-compatible loader; JS only verifies bytes and transports JSON to the shared Rust engine. */
export async function loadSnapReplayRuntime(site: string, reference: SnapReplayReference, expected: { region: string; masterVersion: string; modelCommit: string }, signal?: AbortSignal): Promise<LoadedSnapReplay> {
  if (reference.format !== "nnnotes.replay-manifest/1") throw new SnapReplayError("identity", "Unsupported replay manifest");
  const manifestUrl = new URL(reference.manifestUrl, `${site.replace(/\/+$/, "")}/`).href;
  const manifest = JSON.parse(new TextDecoder().decode(await verified(manifestUrl, reference, signal))) as SnapReplayManifest;
  if (manifest.format !== reference.format || manifest.engine?.requestFormat !== "ournotes.replay/1" || manifest.engine.model.commit !== expected.modelCommit) throw new SnapReplayError("identity", "Replay engine does not match the music data model");
  const resource = (item: SnapReplayResource) => verified(new URL(item.url, manifestUrl).href, item, signal);
  const [input, js, wasm, labels] = await Promise.all([resource(manifest.deckData), resource(manifest.engine.js), resource(manifest.engine.wasm),
    manifest.snapLabels ? resource(manifest.snapLabels) : undefined]);
  const data = JSON.parse(new TextDecoder().decode(input)) as SnapDeckData;
  const master = data.provenance.master as { version?: string } | undefined, model = data.provenance.deck as { commit?: string } | undefined;
  if (data.format !== "nnnotes.deck-data/1" || data.provenance.region !== expected.region || master?.version !== expected.masterVersion || model?.commit !== expected.modelCommit) throw new SnapReplayError("identity", "Replay inputs do not match the selected music-data snapshot");
  const labelSource = labels ? JSON.parse(new TextDecoder().decode(labels)) as SnapLabelSource : undefined;
  const moduleUrl = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
  try {
    const engine = await import(/* @vite-ignore */ moduleUrl) as { default(options: { module_or_path: ArrayBuffer }): Promise<void>; ReplaySession: new (input: string) => SnapReplayEngine };
    await engine.default({ module_or_path: wasm });
    return { data: immutable(data), manifestSha256: reference.sha256, dataSha256: manifest.deckData.sha256, modelCommit: expected.modelCommit, factory: (json) => new engine.ReplaySession(json), ...(labelSource ? { labelSource: immutable(labelSource) } : {}) };
  } finally { URL.revokeObjectURL(moduleUrl); }
}

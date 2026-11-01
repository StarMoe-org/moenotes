import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Md3Provider } from "@/components/md3/Md3Provider";
import { DeckEventSourceControls } from "@/components/deck/DeckManualEventDialog";
import DeckTeamGrowthPanel from "@/components/deck/DeckTeamGrowthPanel";
import type { GameSaveTables } from "@/lib/box/game-save";
import { createBox, type CardBox } from "@/lib/box/model";
import { boxAccountJson } from "@/lib/deck/account-envelope";
import { defaultDeckGoalInput, recommendationRequest, type DeckEvent } from "@/lib/deck/goals";
import { adaptAccount, type AccountInput } from "@/lib/deck/haneoka/account";
import { adaptData, type DeckData } from "@/lib/deck/haneoka/data";
import { evaluateTeamGrowth, type GrowthInvoker } from "@/lib/deck/haneoka/growth";
import { adaptRequest, CAPABILITIES } from "@/lib/deck/haneoka/request";
import {
  buildManualEventEffects,
  extractManualEventTemplate,
  isDeckEventEffect,
  type DeckEventEffect,
} from "@/lib/deck/manual-event";
import { buildTheoreticalMaxBox, maxMemberLevelForRarity, maxSnapLevelForRarity } from "@/lib/deck/theoretical-box";
import { isCurrentDeckWorkerReply, parseDeckWorkerEvent } from "@/lib/deck/worker-protocol";
import { RecognitionBatch } from "@/lib/recognition/batch";
import {
  observedScreenshotBox,
  validateRecognitionResult,
  type RecognitionBinding,
  type RecognitionResult,
  type RecognitionSource,
  type RecognizedCard,
  type RecognizedValue,
} from "@/lib/recognition/protocol";
import { consolidateVideoRecognitionResults, isVideoImportFile, sha256BlobHex } from "@/lib/recognition/video";

const SAMPLE_EFFECTS: DeckEventEffect[] = [
  {
    resourceType: 2,
    characterId: 0,
    bandId: 0,
    cardType: 1,
    tagId: 0,
    memberCardId: 0,
    supportCardId: 0,
    bonusType: 0,
    perRank: [1000, 1000, 1000, 1000, 1000],
  },
  {
    resourceType: 2,
    characterId: 0,
    bandId: 1,
    cardType: 0,
    tagId: 0,
    memberCardId: 0,
    supportCardId: 0,
    bonusType: 0,
    perRank: [2000, 2000, 2000, 2000, 2000],
  },
  {
    resourceType: 2,
    characterId: 0,
    bandId: 0,
    cardType: 0,
    tagId: 0,
    memberCardId: 51,
    supportCardId: 0,
    bonusType: 0,
    perRank: [2000, 2500, 3000, 3500, 5000],
  },
  {
    resourceType: 2,
    characterId: 0,
    bandId: 0,
    cardType: 0,
    tagId: 0,
    memberCardId: 51,
    supportCardId: 0,
    bonusType: 2,
    perRank: [1000, 1000, 1000, 1000, 2000],
  },
  {
    resourceType: 3,
    characterId: 0,
    bandId: 0,
    cardType: 0,
    tagId: 0,
    memberCardId: 0,
    supportCardId: 76,
    bonusType: 0,
    perRank: [1000, 1200, 1400, 1600, 2000],
  },
];

const SAMPLE_EVENT: DeckEvent = {
  id: 50,
  name: "Test Event",
  type: 1,
  startAt: "2026/09/01 15:00:00",
  endAt: "2026/09/09 20:59:59",
  challengeMusics: [],
  effects: SAMPLE_EFFECTS,
};

function loadSliceWithEvent(): { data: DeckData; datasetId: string; saveTables: GameSaveTables } {
  const rawBytes = new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/haneoka-110-slice.json")));
  const data = JSON.parse(new TextDecoder().decode(rawBytes)) as DeckData;
  data.master.MasterEvent = {
    columns: ["_id", "_eventType", "_startAt", "_endAt", "_liveEventPointGroup", "_liveEventRewardGroup"],
    rows: [[50, 1, "2026/09/01 15:00:00", "2026/09/09 20:59:59", 1, 0]],
  };
  data.master.MasterLiveEventPoint = {
    columns: ["_id", "_group", "_scoreRank", "_value"],
    rows: [[1, 1, 1, 100]],
  };
  const updatedBytes = new TextEncoder().encode(JSON.stringify(data));
  const datasetId = createHash("sha256").update(updatedBytes).digest("hex");

  const saveTables: GameSaveTables = {
    server: "jp",
    characters: Array.from({ length: 25 }, (_, i) => String(i + 1)),
    characterRanks: [
      [1, 0],
      [2, 1],
    ],
    members: Object.fromEntries([51, 52, 53, 54, 55, 56, 57, 58, 59, 60].map((id) => [String(id), 3])),
    memberLevels: {
      "3": [
        [1, 0],
        [60, 321650],
      ],
    },
    snaps: { "76": 3 },
    snapLevels: {
      "3": [
        [1, 0],
        [60, 321650],
      ],
    },
    bandItems: {},
    memories: {},
    musicRanks: {},
  };
  return { data, datasetId, saveTables };
}

describe("Manual Event Bonuses (3e027db)", () => {
  test("extracts event bonus templates, synthesizes custom effects, and adapts requests with rewardActive + eventEffects", () => {
    expect(CAPABILITIES.manualEventBonuses).toBe(true);
    expect(CAPABILITIES.teamGrowth).toBe(true);

    const template = extractManualEventTemplate(SAMPLE_EVENT);
    expect(template).not.toBeNull();
    expect(template!.memberTiers).toHaveLength(1);
    expect(template!.memberTiers[0]!.maxPointPercent).toBe(50);
    expect(template!.memberTiers[0]!.maxParamPercent).toBe(20);
    expect(template!.snapTiers[0]!.maxPointPercent).toBe(20);
    expect(template!.defaultDraft).toEqual({
      templateEventId: 50,
      attributes: [1],
      targetKind: "band",
      targets: [1],
      featuredMembers: [{ cardId: 51, tierKey: template!.memberTiers[0]!.key }],
      featuredSnaps: [{ cardId: 76, tierKey: template!.snapTiers[0]!.key }],
    });

    const editedEffects = buildManualEventEffects(template!, {
      templateEventId: 50,
      attributes: [2, 4],
      targetKind: "character",
      targets: [3],
      featuredMembers: [{ cardId: 55, tierKey: template!.memberTiers[0]!.key }],
      featuredSnaps: [{ cardId: 76, tierKey: template!.snapTiers[0]!.key }],
    });
    expect(editedEffects.every(isDeckEventEffect)).toBe(true);
    expect(editedEffects.filter((e) => e.cardType > 0).map((e) => e.cardType)).toEqual([2, 4]);
    expect(editedEffects.some((e) => e.characterId === 3 && e.bandId === 0)).toBe(true);
    expect(editedEffects.filter((e) => e.memberCardId === 55)).toHaveLength(2);

    const { data } = loadSliceWithEvent();
    const endedNow = Date.parse("2026-11-01T00:00:00Z");
    const ptInput = { ...defaultDeckGoalInput("eventPoints"), musicId: 100001, difficulty: "expert" as const };
    const reqJson = recommendationRequest(ptInput, {
      event: SAMPLE_EVENT,
      now: endedNow,
      constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
      manualEvent: true,
      eventEffects: editedEffects,
    });
    const parsedReq = JSON.parse(reqJson);
    expect(parsedReq.manualEvent).toBe(true);
    expect(parsedReq.eventEffects).toHaveLength(editedEffects.length);

    const adapted = adaptRequest(data, parsedReq);
    expect((adapted.goal as { rewardActive?: boolean; eventEffects?: unknown[] }).rewardActive).toBe(true);
    expect((adapted.goal as { eventEffects?: unknown[] }).eventEffects).toHaveLength(editedEffects.length);

    const powerInput = { ...defaultDeckGoalInput("power"), eventParameter: true };
    const powerJson = recommendationRequest(powerInput, {
      event: SAMPLE_EVENT,
      now: endedNow,
      constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
      manualEvent: true,
      eventEffects: editedEffects,
    });
    const adaptedPower = adaptRequest(data, JSON.parse(powerJson));
    expect(adaptedPower.goal).toMatchObject({
      kind: "power",
      parameterEventId: 50,
    });
    expect((adaptedPower.goal as { eventEffects?: unknown[] }).eventEffects).toHaveLength(editedEffects.length);

    const controlsHtml = renderToStaticMarkup(
      <Md3Provider>
        <DeckEventSourceControls
          locale="zh-CN"
          mode="custom"
          heldEvent={null}
          events={[SAMPLE_EVENT]}
          selectedEventId={50}
          customTemplates={[{ event: SAMPLE_EVENT, template: template! }]}
          customDraft={template!.defaultDraft}
          canCustom
          onModeChange={() => {}}
          onSelectedEventChange={() => {}}
          onOpenCustomModal={() => {}}
        />
      </Md3Provider>,
    );
    expect(controlsHtml).toContain("自定义模拟");
    expect(controlsHtml).toContain("配置模拟加成");
  });
});

describe("Theoretical Max Box", () => {
  test("builds ephemeral max-practice Box without mutating source and passes adaptAccount cleanly even from null Box", () => {
    expect(maxMemberLevelForRarity(2, 5)).toBe(70);
    expect(maxMemberLevelForRarity(3, 5)).toBe(80);
    expect(maxMemberLevelForRarity(4, 5)).toBe(90);
    expect(maxSnapLevelForRarity(4, 5)).toBe(90);

    const { data, datasetId, saveTables } = loadSliceWithEvent();
    const existing = createBox("jp", "real-box", 100);
    const existingSnapshot = JSON.stringify(existing);

    const theoryFromNull: CardBox = buildTheoreticalMaxBox(
      null,
      "jp",
      {
        members: [51, 52, 53, 54, 55].map((id, idx) => ({ id, rarity: 4, characterId: idx + 1 }) as never),
        snaps: [{ id: 76, rarity: 4 } as never],
      },
      saveTables,
    );
    expect(JSON.stringify(existing)).toBe(existingSnapshot);
    expect(theoryFromNull.cards).toHaveLength(6);
    // Clamped to saveTables max level 60 in fixture!
    expect(theoryFromNull.cards[0]!.fields.level.value).toBe(60);
    expect(theoryFromNull.cards[0]!.fields.awake.value).toBe(5);
    expect(theoryFromNull.cards[0]!.fields.rank.value).toBe(5);
    expect(theoryFromNull.cards[0]!.fields.liveSkillLevel.value).toBe(5);

    const accountJson = boxAccountJson({ datasetId, server: "jp" }, theoryFromNull, saveTables, { fallbackBandItems: true });
    const adapted = adaptAccount(
      data,
      JSON.parse(accountJson) as AccountInput,
      JSON.parse(
        recommendationRequest(
          { ...defaultDeckGoalInput("free"), musicId: 100001, difficulty: "expert" },
          { event: null, now: 0, constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] } },
        ),
      ),
      datasetId,
    );
    expect(adapted.missing).toEqual([]);
    expect(adapted.errors).toEqual([]);
    expect(adapted.members).toHaveLength(5);
    expect(adapted.snaps).toHaveLength(1);
  });
});

describe("Team Growth / Upgrade Impact evaluation & Worker protocol", () => {
  test("evaluates single-card step and full upgrades on a pinned team and sorts descending by gain", () => {
    const { data, datasetId, saveTables } = loadSliceWithEvent();
    adaptData(data, datasetId);

    const fullBox = buildTheoreticalMaxBox(
      null,
      "jp",
      {
        members: [51, 52, 53, 54, 55].map((id, idx) => ({ id, rarity: 4, characterId: idx + 1 }) as never),
        snaps: [{ id: 76, rarity: 4 } as never],
      },
      saveTables,
    );
    // Make leader card 51 upgradable (Lv 1, awake 2, rank 1, liveSkill 1) while 52..55 stay at fixture max!
    const customBox: CardBox = {
      ...fullBox,
      cards: fullBox.cards.map((card) =>
        card.identity.value === "51"
          ? {
              ...card,
              fields: {
                ...card.fields,
                level: { ...card.fields.level, value: 1 },
                awake: { ...card.fields.awake, value: 2 },
                rank: { ...card.fields.rank, value: 1 },
                liveSkillLevel: { ...card.fields.liveSkillLevel, value: 1 },
              },
            }
          : card,
      ),
    };

    const accountJson = boxAccountJson({ datasetId, server: "jp" }, customBox, saveTables, { fallbackBandItems: true });
    const requestJson = recommendationRequest(
      { ...defaultDeckGoalInput("free"), musicId: 100001, difficulty: "expert" },
      { event: null, now: 0, constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] } },
    );

    const mockInvoker: GrowthInvoker = {
      run(_charts, payload) {
        const members = payload.members as {
          key: string;
          level: number;
          awake: number;
          rank: number;
          liveSkillLevel: number;
        }[];
        const power = members.reduce(
          (sum, m) => sum + m.level * 100 + m.awake * 500 + m.rank * 800,
          0,
        );
        const skillBonus = members.reduce((sum, m, idx) => sum + m.liveSkillLevel * (idx === 0 ? 5000 : 1000), 0);
        const meanScore = power * 3 + skillBonus;
        return {
          overall: [
            {
              members: ["m51", "m52", "m53", "m54", "m55"],
              snaps: ["s76", null, null, null, null],
              power,
              key: meanScore,
              score: { mean: meanScore, orders: Array.from({ length: 120 }, () => meanScore) },
            },
          ],
        };
      },
    };

    const reportJson = evaluateTeamGrowth(
      data,
      datasetId,
      mockInvoker,
      accountJson,
      requestJson,
      JSON.stringify({
        members: [51, 52, 53, 54, 55],
        snaps: [76, null, null, null, null],
        song: { musicId: 100001, difficulty: "expert" },
      }),
    );
    const report = JSON.parse(reportJson);
    expect(report.status).toBe("ok");
    expect(report.cards.find((c: { cardId: number }) => c.cardId === 51)?.status).toBe("upgradable");
    expect(report.scenarios.length).toBeGreaterThanOrEqual(5);
    expect(report.scenarios[0].action).toBe("full");
    expect(report.scenarios[0].primaryGain).toBeGreaterThan(report.scenarios[1].primaryGain);

    const growthEvent = parseDeckWorkerEvent({
      type: "growthResult",
      jobId: "jp:growth:1",
      inputRevision: 1,
      growthJson: reportJson,
    });
    expect(growthEvent?.type).toBe("growthResult");
    expect(isCurrentDeckWorkerReply({ jobId: "jp:growth:1", inputRevision: 1 }, growthEvent!)).toBe(true);

    const panelHtml = renderToStaticMarkup(
      <Md3Provider>
        <DeckTeamGrowthPanel
          locale="zh-CN"
          report={report}
          loading={false}
          onEvaluate={() => {}}
          memberById={new Map()}
          snapById={new Map()}
        />
      </Md3Provider>,
    );
    expect(panelHtml).toContain("队伍单卡养成收益排序");
    expect(panelHtml).toContain("队长");
    expect(panelHtml).toContain("演出技能 1 → 2");
  });
});

describe("Box Screen Recording Video Import consolidation", () => {
  const hex64 = (ch: string) => ch.repeat(64);
  const source: RecognitionSource = {
    server: "jp",
    sourceId: "src-jp-1",
    catalogueSignature: hex64("c"),
    cards: [
      { kind: "member", id: "101" },
      { kind: "member", id: "102" },
      { kind: "member", id: "999" },
    ],
    gallery: {
      galleryId: hex64("f"),
      compatibleCardKeys: ["member:101", "member:102", "member:999"],
    },
  };

  function makeValue(val: number | null, confidence = 0.96): RecognizedValue {
    if (val === null) return { value: null, reason: "unread" };
    return {
      value: val,
      confidence,
      method: "boxLensClassifierOrtWasm",
      modelSha256: hex64("b"),
      runtimeId: "ort-1",
      bbox: [10, 10, 40, 20],
    };
  }

  function makeCard(
    id: string,
    similarity: number,
    level: number | null,
    rank: number | null,
    awake: number | null,
  ): RecognizedCard {
    return {
      kind: "member",
      id,
      candidates: [id],
      identityMethod: "boxLensEncoderOrtWasm",
      identitySimilarity: similarity,
      identityMargin: 0.25,
      locatorScore: 0.99,
      visibleFraction: 1,
      review: true,
      displayMode: "level",
      bbox: [20, 30, 120, 120],
      level: makeValue(level),
      card_rank: makeValue(rank),
      awake_count: makeValue(awake),
    };
  }

  test("identifies video files, hashes video bytes, and consolidates multi-frame observations through RecognitionBatch", async () => {
    expect(isVideoImportFile({ type: "video/mp4", name: "clip.mp4" })).toBe(true);
    expect(isVideoImportFile({ type: "", name: "recording.MOV" })).toBe(true);
    expect(isVideoImportFile({ type: "image/png", name: "screen.png" })).toBe(false);

    const videoBlob = new Blob(["fake-mp4-bytes"], { type: "video/mp4" });
    const videoSourceId = await sha256BlobHex(videoBlob);
    expect(videoSourceId).toMatch(/^[a-f0-9]{64}$/);

    const batch = new RecognitionBatch({
      batchId: "batch-video-1",
      inputRevision: "0",
      source,
      manifestSha256: hex64("d"),
      at: 1_760_000_000_000,
      files: [{ key: "v1", name: "box-scroll.mp4" }],
    });

    const prepared = batch.prepare("v1", { jobId: "video-job-1", startedAt: 100, deadline: 60_100 });
    const binding: RecognitionBinding = batch.begin("v1", {
      jobId: "video-job-1",
      sourceId: videoSourceId,
      width: 1920,
      height: 1080,
      startedAt: 100,
      deadline: 60_100,
    });
    expect(binding.jobId).toBe(prepared.jobId);

    const makeFrame = (index: number, cards: RecognizedCard[]) => ({
      result: {
        type: "result" as const,
        binding: { ...binding, jobId: `video-job-1:f${index}` },
        status: "complete" as const,
        cards,
        unidentified: [],
        sourceId: hex64(String(index)),
        elapsedMs: 25,
        scope: {
          galleryId: hex64("f"),
          modelsSha256: hex64("e"),
          coverage: "observed_only" as const,
          fullScanCertified: false,
        },
      } satisfies RecognitionResult,
      frame: new Blob(["jpeg"], { type: "image/jpeg" }),
      width: 1920,
      height: 1080,
    });

    const consolidated = consolidateVideoRecognitionResults(
      [
        makeFrame(1, [
          makeCard("101", 0.91, 90, 5, 5),
          makeCard("999", 0.95, 50, 1, 1),
        ]),
        makeFrame(2, [
          makeCard("101", 0.94, 90, 5, 4),
          makeCard("102", 0.75, 60, 2, 2),
        ]),
        makeFrame(3, [
          makeCard("101", 0.93, 90, 5, null),
          makeCard("102", 0.78, 60, 2, 2),
        ]),
      ],
      binding,
      videoSourceId,
      3,
    );

    expect(consolidated.result.status).toBe("complete");
    expect(consolidated.result.cards).toHaveLength(1);
    const card101 = consolidated.result.cards[0]!;
    expect(card101.id).toBe("101");
    expect(card101.identitySimilarity).toBe(0.94);
    expect(card101.level.value).toBe(90);
    expect(card101.card_rank.value).toBe(5);
    expect(card101.awake_count).toEqual({ value: null, reason: "unread-or-disagreeing" });

    expect(() => validateRecognitionResult(consolidated.result, binding, source, videoSourceId)).not.toThrow();
    const finished = batch.finish("v1", consolidated.result, 200);
    expect(finished).toBe(true);

    const observed = observedScreenshotBox(consolidated.result, source, hex64("d"), 1_760_000_000_000, [1920, 1080]);
    expect(observed.cards).toHaveLength(1);
    expect(observed.cards[0]!.identity.value).toBe("101");
    expect(observed.cards[0]!.fields.level.value).toBe(90);
    expect(observed.cards[0]!.fields.rank.value).toBe(5);
    expect(observed.cards[0]!.fields.awake.value).toBeNull();
  });
});

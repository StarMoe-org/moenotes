import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { answerField, createBox, createCard } from "../src/lib/box/model";
import { buildGameSaveTables } from "../src/lib/masterdata/save-tables";
import { DECK_MASTER_OVERLAY_FORMAT, getDeckMasterOverlay } from "../src/lib/masterdata/deck-master";
import { resetMasterDataSnapshotForTests } from "../src/lib/masterdata/build-snapshot";
import { boxAccountJson } from "../src/lib/deck/account-envelope";
import { buildDeckMasterOverlayUrl, sha256Hex } from "../src/lib/deck/runtime-source";
import { DECK_WORKER_PROTOCOL, deckWorkerInit, type DeckWorkerInit } from "../src/lib/deck/worker-protocol";
import { adaptAccount, type AccountInput } from "../src/lib/deck/haneoka/account";
import { adaptData, type DeckData } from "../src/lib/deck/haneoka/data";
import type { RecommendationRequest } from "../src/lib/deck/haneoka/request";

const runtimeDir = path.join(import.meta.dir, "..", "public", "deck");
const { createDeckWorkerCore } = await import(path.join(runtimeDir, "deck-worker-core.mjs")) as {
  createDeckWorkerCore(platform: Record<string, unknown>): { handle(message: unknown): Promise<void> };
};

function loadSlice(): { rawBytes: Uint8Array; data: DeckData; datasetId: string } {
  const rawBytes = new Uint8Array(readFileSync(path.join(process.cwd(), "tests/fixtures/haneoka-110-slice.json")));
  const data = JSON.parse(new TextDecoder().decode(rawBytes)) as DeckData;
  const datasetId = createHash("sha256").update(rawBytes).digest("hex");
  return { rawBytes, data, datasetId };
}

const FREE_REQ: RecommendationRequest = {
  format: "ournotes-deck.recommendation-request/2",
  goal: { kind: "freeLive", musicId: 100001, difficulty: "expert" },
  aggregation: "expected",
  k: 1,
};

describe("Issue #71: live MasterData overlay and unknown card resilience", () => {
  test("projects MasterData tables into nnnotes.deck-data/1 columnar overlay and resolves newly released cards 74 and 77", async () => {
    const { data: baseData } = loadSlice();
    const prevDir = process.env.MOENOTES_MASTERDATA_DIR;
    const tempDir = mkdtempSync(path.join(tmpdir(), "moenotes-md-overlay-"));

    try {
      // Synthesize a live MasterData directory from the 1.1.0.100 fixture plus newly added MemberCard 74 & SupportCards 74, 77.
      writeFileSync(
        path.join(tempDir, "current_version.json"),
        JSON.stringify({
          dataVersion: "test-live-110-new-cards",
          regions: {
            jp: { version: "1.1.0.105/abcdef123456" },
            "hk-tw-mo": { version: "1.1.0.105/abcdef123456" },
          },
        }),
      );
      for (const region of ["jp", "hk-tw-mo"]) {
        const regionDir = path.join(tempDir, region);
        mkdirSync(regionDir, { recursive: true });
        for (const [tableName, table] of Object.entries(baseData.master)) {
          if (tableName === "MasterArenaMusic") continue;
          const allData = table.rows.map((row) =>
            Object.fromEntries(table.columns.map((col, idx) => [col, row[idx]])),
          );
          if (tableName === "MasterMemberCard") {
            const template = allData[0]!;
            allData.push({ ...template, _id: 74, _rarity: 3 });
          }
          if (tableName === "MasterSupportCard") {
            const template = allData[0]!;
            allData.push({ ...template, _id: 74, _rarity: 10 });
            allData.push({ ...template, _id: 77, _rarity: 3 });
          }
          writeFileSync(path.join(regionDir, `${tableName}.json`), JSON.stringify({ _allData: allData }));
        }
      }

      process.env.MOENOTES_MASTERDATA_DIR = tempDir;
      resetMasterDataSnapshotForTests();

      const overlay = await getDeckMasterOverlay("jp", { forceBypass: true });
      expect(overlay.format).toBe(DECK_MASTER_OVERLAY_FORMAT);
      expect(overlay.server).toBe("jp");
      expect(overlay.regionVersion).toBe("1.1.0.105/abcdef123456");

      const merged: DeckData = {
        ...baseData,
        master: { ...baseData.master, ...overlay.master },
      };
      const mergedBytes = new TextEncoder().encode(JSON.stringify(merged));
      const mergedSha = createHash("sha256").update(mergedBytes).digest("hex");

      const engineData = adaptData(merged, mergedSha);
      expect(engineData.members["74"]).toBeDefined();
      expect(engineData.snapshots["74"]).toBeDefined();
      expect(engineData.snapshots["77"]).toBeDefined();

      const account: AccountInput = {
        format: "ournotes.account/1",
        datasetId: mergedSha,
        server: "jp",
        revision: "issue-71",
        coverage: {
          "_player._characters": "complete",
          "_player._bandItems": "partial",
          "_player._memberCards": "complete",
          "_player._supportCards": "complete",
        },
        declared: { _vip: { _rank: 1 } },
        account: {
          _player: {
            _memberCards: [51, 52, 53, 54, 74].map((id) => ({
              _masterId: id,
              _exp: 0,
              _awakeCount: 1,
              _rank: 1,
              _liveSkillLevel: 1,
              _performanceSkillLevel: 1,
            })),
            _supportCards: [74, 76, 77].map((id) => ({
              _masterId: id,
              _exp: 0,
              _rank: 1,
            })),
            _characters: [],
            _bandItems: [],
          },
        },
      };

      const adapted = adaptAccount(merged, account, FREE_REQ, mergedSha);
      expect(adapted.errors).toEqual([]);
      expect(adapted.missing).toEqual([]);
      expect(adapted.coversAllOwnedCards).toBe(true);
      expect(adapted.members.map((m) => m.cardId)).toContain(74);
      expect(adapted.snaps.map((s) => s.cardId)).toEqual([74, 76, 77]);
    } finally {
      if (prevDir === undefined) delete process.env.MOENOTES_MASTERDATA_DIR;
      else process.env.MOENOTES_MASTERDATA_DIR = prevDir;
      resetMasterDataSnapshotForTests();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("if real /tmp/moenotes-masterdata checkout exists, live JP and TW overlays adapt cleanly with real cards 74 and 77", async () => {
    if (!existsSync("/tmp/moenotes-masterdata/current_version.json")) return;
    const { data: baseData } = loadSlice();
    const prevDir = process.env.MOENOTES_MASTERDATA_DIR;
    try {
      process.env.MOENOTES_MASTERDATA_DIR = "/tmp/moenotes-masterdata";
      resetMasterDataSnapshotForTests();
      for (const server of ["jp", "tw"] as const) {
        const overlay = await getDeckMasterOverlay(server, { forceBypass: true });
        const merged: DeckData = {
          ...baseData,
          provenance: { ...baseData.provenance, region: server },
          master: { ...baseData.master, ...overlay.master },
        };
        const sha = createHash("sha256").update(JSON.stringify(merged)).digest("hex");
        const engineData = adaptData(merged, sha);
        expect(engineData.members["74"]).toBeDefined();
        expect(engineData.snapshots["74"]).toBeDefined();
        expect(engineData.snapshots["77"]).toBeDefined();
      }
    } finally {
      if (prevDir === undefined) delete process.env.MOENOTES_MASTERDATA_DIR;
      else process.env.MOENOTES_MASTERDATA_DIR = prevDir;
      resetMasterDataSnapshotForTests();
    }
  });

  test("skips unknown future card, character, bandItem and memory IDs without aborting the solver", () => {
    const { data, datasetId } = loadSlice();
    const account: AccountInput = {
      format: "ournotes.account/1",
      datasetId,
      server: "jp",
      revision: "future-patch",
      coverage: {
        "_player._characters": "complete",
        "_player._bandItems": "complete",
        "_player._memberCards": "complete",
        "_player._supportCards": "complete",
      },
      declared: { _vip: { _rank: 1 } },
      account: {
        _player: {
          _memberCards: [51, 52, 53, 54, 55, 999991].map((id) => ({
            _masterId: id,
            _exp: 0,
            _awakeCount: 1,
            _rank: 1,
            _liveSkillLevel: 1,
            _performanceSkillLevel: 1,
          })),
          _supportCards: [76, 999992].map((id) => ({ _masterId: id, _exp: 0, _rank: 1 })),
          _characters: [{ _masterId: 999993, _exp: 0 }],
          _bandItems: [{ _masterId: 999994, _level: 5 }],
          _memory: {
            _members: [{ _id: 999991, _unlocked: true }],
            _supports: [{ _id: 999992, _unlocked: true }],
            _musicGroups: [{ _id: 999995, _musics: [{ _id: 999996, _unlockedScoreRank: 4 }] }],
          },
        },
      },
    };

    const adapted = adaptAccount(data, account, FREE_REQ, datasetId);
    expect(adapted.errors).toEqual([]);
    expect(adapted.missing).toEqual([]);
    expect(adapted.members.map((m) => m.cardId)).toEqual([51, 52, 53, 54, 55]);
    expect(adapted.snaps.map((s) => s.cardId)).toEqual([76]);
    // Because an owned card was unknown to the dataset, optimality must not claim full owned-card coverage.
    expect(adapted.coversAllOwnedCards).toBe(false);
  });
});

describe("Issue #71: _player._bandItems fallback (partial bonus edits, null levels, omitted lists)", () => {
  test("adaptAccount defaults partial, omitted, null-level and out-of-range _bandItems cleanly without missing errors", () => {
    const { data: slice } = loadSlice();
    const knownBandItemId = 101;
    const data: DeckData = {
      ...slice,
      master: {
        ...slice.master,
        MasterBandItem: { columns: ["_id", "_bandId"], rows: [[101, 1], [102, 1]] },
        MasterBandItemLevel: {
          columns: ["_id", "_bandItemId", "_level", "_playerRank"],
          rows: [[1, 101, 1, 1], [2, 101, 2, 1], [3, 101, 3, 1], [4, 102, 1, 1]],
        },
        MasterBandItemSkillEffect: {
          columns: ["_id", "_bandItemId", "_level", "_skillTargetIDs", "_skillEffectType", "_effectValue"],
          rows: [[1, 101, 1, [3], 1000, 10], [2, 101, 2, [3], 1000, 20], [3, 101, 3, [3], 1000, 30], [4, 102, 1, [3], 1000, 10]],
        },
      },
    };
    const datasetId = createHash("sha256").update(JSON.stringify(data)).digest("hex");

    const partialAccount: AccountInput = {
      format: "ournotes.account/1",
      datasetId,
      server: "jp",
      revision: "partial-band-items",
      coverage: {
        "_player._characters": "complete",
        "_player._bandItems": "partial",
        "_player._memberCards": "complete",
        "_player._supportCards": "complete",
      },
      declared: { _vip: { _rank: 1 } },
      account: {
        _player: {
          _memberCards: [51, 52, 53, 54, 55].map((id) => ({
            _masterId: id,
            _exp: 0,
            _awakeCount: 1,
            _rank: 1,
            _liveSkillLevel: 1,
            _performanceSkillLevel: 1,
          })),
          _supportCards: [{ _masterId: 76, _exp: 0, _rank: 1 }],
          _characters: [],
          _bandItems: [
            { _masterId: knownBandItemId, _level: null },
          ],
        },
      },
    };

    const adaptedNull = adaptAccount(data, partialAccount, FREE_REQ, datasetId);
    expect(adaptedNull.missing).toEqual([]);
    expect(adaptedNull.errors).toEqual([]);
    expect(adaptedNull.player.bandItems[String(knownBandItemId)]).toBe(0);

    // Omitted _bandItems in modified save JSON + clamped high level on string _masterId
    const omittedSaveAccount: AccountInput = {
      ...partialAccount,
      account: {
        _player: {
          _memberCards: partialAccount.account._player._memberCards,
          _supportCards: partialAccount.account._player._supportCards,
        },
      },
    };
    const adaptedOmitted = adaptAccount(data, omittedSaveAccount, FREE_REQ, datasetId);
    expect(adaptedOmitted.missing).toEqual([]);
    expect(adaptedOmitted.errors).toEqual([]);
    expect(adaptedOmitted.player.bandItems[String(knownBandItemId)]).toBe(0);

    const clampedAccount: AccountInput = {
      ...partialAccount,
      account: {
        _player: {
          ...partialAccount.account._player,
          _bandItems: [{ _masterId: String(knownBandItemId), _level: 999 }],
        },
      },
    };
    const adaptedClamped = adaptAccount(data, clampedAccount, FREE_REQ, datasetId);
    expect(adaptedClamped.missing).toEqual([]);
    expect(adaptedClamped.errors).toEqual([]);
    expect(adaptedClamped.player.bandItems[String(knownBandItemId)]).toBeGreaterThan(0);
  });

  test("boxAccountJson with fallbackBandItems marks _player._bandItems complete and defaults unset/null items to 0", () => {
    const saveTables = buildGameSaveTables("tw", {
      memberCards: [{ id: 101, memberCardLevelGroup: 1 }],
      supportCards: [],
      memberCardLevels: [{ group: 1, level: 1, exp: 0 }],
      supportCardLevels: [],
      characterRanks: [{ id: 1, rank: 1, exp: 0 }],
      characters: [{ id: 1 }],
      bandItems: [{ id: 501 }, { id: 502 }, { id: 503 }],
      bandItemLevels: [
        { bandItemId: 501, level: 1 },
        { bandItemId: 501, level: 2 },
        { bandItemId: 502, level: 1 },
        { bandItemId: 503, level: 1 },
      ],
      memoryMusicGroups: [],
      memoryMusics: [],
    });

    const box = createBox("tw", "bonus-edit-box", 1);
    box.cards = [createCard("member", "m1", "101", 1)];
    // Item 501 marked owned with unset level (null), item 502 set to level 1, item 503 untouched.
    box.player.bandItemStates["501"] = answerField(
      { status: "unknown", value: null, history: [], needsReview: false },
      { id: "s501", value: "owned", source: "manual", at: 2 },
    );
    box.player.bandItemStates["502"] = answerField(
      { status: "unknown", value: null, history: [], needsReview: false },
      { id: "s502", value: "owned", source: "manual", at: 2 },
    );
    box.player.bandItems["502"] = answerField(
      { status: "unknown", value: null, history: [], needsReview: false },
      { id: "l502", value: 1, source: "manual", at: 2 },
    );

    const target = { datasetId: "d".repeat(64), server: "intl" as const };
    const strictParsed = JSON.parse(boxAccountJson(target, box, saveTables));
    expect(strictParsed.coverage["_player._bandItems"]).toBe("partial");

    const fallbackParsed = JSON.parse(boxAccountJson(target, box, saveTables, { fallbackBandItems: true }));
    expect(fallbackParsed.coverage["_player._bandItems"]).toBe("complete");
    expect(fallbackParsed.account._player._bandItems).toEqual([
      { _masterId: 501, _level: 0 },
      { _masterId: 502, _level: 1 },
      { _masterId: 503, _level: 0 },
    ]);
    expect(fallbackParsed.assumptions).toContainEqual({
      path: "_player._bandItems",
      reason: "Unset or incomplete band items default to level 0",
    });
  });
});

describe("Issue #71: Worker masterOverlayUrl merge and fallback", () => {
  const encode = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
  const digest = (bytes: Uint8Array) => sha256Hex(bytes.slice().buffer);

  test("merges live masterOverlayUrl tables, updates datasetId and catalog, and falls back cleanly on overlay error", async () => {
    expect(buildDeckMasterOverlayUrl("jp", "1.1.0.100/abc")).toBe("/api/v1/meta/deck-master?server=jp&v=1.1.0.100%2Fabc");

    const baseDeck = {
      format: "nnnotes.deck-data/1",
      provenance: { region: "jp", deck: { commit: "0123abcd" } },
      master: {
        MasterEvent: { columns: ["_id", "_eventItemId", "_liveEventRewardGroup", "_challengeLiveEventRewardGroup"], rows: [[1, 10, 0, 0]] },
      },
      charts: [],
    };
    const baseBytes = encode(baseDeck);
    const baseSha = await digest(baseBytes);
    const wasm = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
    const glue = encode("unused-in-injected-loader");
    const wasmSha = await digest(wasm);
    const glueSha = await digest(glue);

    const overlayPayload = {
      format: DECK_MASTER_OVERLAY_FORMAT,
      server: "jp",
      region: "jp",
      dataVersion: "live",
      regionVersion: "1.1.0.100",
      sha256: "f".repeat(64),
      master: {
        MasterEvent: {
          columns: ["_id", "_eventItemId", "_liveEventRewardGroup", "_challengeLiveEventRewardGroup"],
          rows: [[1, 10, 0, 0], [2, 20, 0, 0]],
        },
      },
    };

    const files = new Map<string, Uint8Array>([
      ["https://data.example.invalid/deck-data.json", baseBytes],
      ["https://data.example.invalid/solver.wasm", wasm],
      ["https://data.example.invalid/solver.js", glue],
      ["https://data.example.invalid/api/v1/meta/deck-master?server=jp", encode(overlayPayload)],
    ]);

    const posted: Record<string, unknown>[] = [];
    const worker = createDeckWorkerCore({
      post: (msg: Record<string, unknown>) => { posted.push(msg); },
      fetch: async (url: string) => {
        const body = files.get(url);
        return body ? new Response(body.slice()) : new Response("missing", { status: 404 });
      },
      loadSolver: async () => class MockSolver {
        datasetId: string;
        constructor(_bytes: Uint8Array, options: { datasetId: string }) {
          this.datasetId = options.datasetId;
        }
        capabilities() { return '{"arenaRules":true}'; }
      },
    });

    const initMsg: DeckWorkerInit = deckWorkerInit({
      server: "jp",
      pointer: { kind: "build", url: "https://data.example.invalid/build.json" },
      manifest: { url: "https://data.example.invalid/manifest.json", sha256: "a".repeat(64) },
      deckData: { url: "https://data.example.invalid/deck-data.json", sha256: baseSha, bytes: baseBytes.length },
      engine: {
        model: null,
        js: { url: "https://data.example.invalid/solver.js", sha256: glueSha, bytes: glue.length },
        wasm: { url: "https://data.example.invalid/solver.wasm", sha256: wasmSha, bytes: wasm.length },
        build: null,
      },
      modelCommit: null,
      override: true,
      masterOverlayUrl: "https://data.example.invalid/api/v1/meta/deck-master?server=jp",
    });

    await worker.handle(initMsg);
    expect(posted).toHaveLength(1);
    expect(posted[0]!.type).toBe("ready");
    expect(posted[0]!.datasetId).not.toBe(baseSha);
    expect((posted[0]!.catalog as { eventIds: number[] }).eventIds).toEqual([1, 2]);

    // Verify graceful fallback when masterOverlayUrl returns 500
    const postedFallback: Record<string, unknown>[] = [];
    const fallbackWorker = createDeckWorkerCore({
      post: (msg: Record<string, unknown>) => { postedFallback.push(msg); },
      fetch: async (url: string) => {
        if (url.includes("deck-master")) return new Response("error", { status: 502 });
        const body = files.get(url);
        return body ? new Response(body.slice()) : new Response("missing", { status: 404 });
      },
      loadSolver: async () => class MockSolver {
        datasetId: string;
        constructor(_bytes: Uint8Array, options: { datasetId: string }) {
          this.datasetId = options.datasetId;
        }
        capabilities() { return '{"arenaRules":true}'; }
      },
    });
    await fallbackWorker.handle(initMsg);
    expect(postedFallback).toHaveLength(1);
    expect(postedFallback[0]).toMatchObject({
      type: "ready",
      datasetId: baseSha,
      catalog: expect.objectContaining({ eventIds: [1] }),
    });
  });
});

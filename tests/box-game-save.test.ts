import { describe, expect, test } from "bun:test";
import { deleteGameSave, downloadGameSave, etagSha256, GameSaveError, gameSaveText, listGameSaves, parseGameSaveList, sha256Hex } from "../src/lib/account/game-saves";
import { gameSaveServer, gameSavePath } from "../src/config/account";
import { deriveGameSaveBox, expForLevel, gameSaveCounts, levelByExp, parseGameSave, unavailableGameSaveBox, type GameSaveTables } from "../src/lib/box/game-save";
import { buildGameSaveTables } from "../src/lib/masterdata/save-tables";
import { answerField, createBox, createCard, parseBox, type BoxSaveLink, type CardBox } from "../src/lib/box/model";
import { ACCOUNT_COVERAGE_PATHS, boxAccountJson, gameSaveAccountJson } from "../src/lib/deck/account-envelope";

const SHA_A = "a".repeat(64), SHA_B = "b".repeat(64);
const DATASET = "c".repeat(64);
const encoder = new TextEncoder();
const listEntry = (overrides: Record<string, unknown> = {}) => ({ server: "intl", accountId: "20000000001", sha256: SHA_A, size: 120, storedSize: 60,
  uploadedAt: 1_700_000_000_000, checkedAt: 1_700_000_000_500, client: "test-client/1", ...overrides });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const fetchOf = (respond: (url: string, init: RequestInit) => Response) => (async (url: RequestInfo | URL, init?: RequestInit) => respond(String(url), init ?? {})) as typeof fetch;

/** Synthetic Master subset: two level groups, three ranks of character experience, two band items. */
const tables: GameSaveTables = buildGameSaveTables("tw", {
  memberCards: [{ id: 101, memberCardLevelGroup: 1 }, { id: 102, memberCardLevelGroup: 2 }],
  supportCards: [{ id: 201, supportCardLevelGroup: 1 }],
  memberCardLevels: [{ group: 1, level: 3, exp: 30 }, { group: 1, level: 1, exp: 0 }, { group: 1, level: 2, exp: 10 }, { group: 2, level: 1, exp: 0 }, { group: 2, level: 2, exp: 5 }],
  supportCardLevels: [{ group: 1, level: 1, exp: 0 }, { group: 1, level: 2, exp: 7 }],
  characterRanks: [{ id: 2, rank: 2, exp: 3 }, { id: 1, rank: 1, exp: 0 }, { id: 3, rank: 3, exp: 9 }],
  characters: [{ id: 1 }, { id: 2 }, { id: 3 }],
  bandItems: [{ id: 501 }, { id: 502 }],
  bandItemLevels: [{ bandItemId: 501, level: 2 }, { bandItemId: 501, level: 1 }, { bandItemId: 502, level: 1 }],
  memoryMusicGroups: [{ id: 7 }],
  memoryMusics: [{ id: 71, groupId: 7 }],
});
const link = (overrides: Partial<BoxSaveLink> = {}): BoxSaveLink => ({ server: "intl", accountId: "20000000001", sha256: SHA_A, uploadedAt: 1_700_000_000_000, ...overrides });

describe("game save API client", () => {
  test("lists saves strictly and ignores fields it does not read", () => {
    const [save] = parseGameSaveList({ saves: [listEntry({ extra: true })] });
    expect(save).toEqual({ server: "intl", accountId: "20000000001", sha256: SHA_A, size: 120, uploadedAt: 1_700_000_000_000, checkedAt: 1_700_000_000_500, client: "test-client/1" });
    for (const bad of [{}, { saves: [listEntry({ server: "tw" })] }, { saves: [listEntry({ accountId: 20000000001 })] }, { saves: [listEntry({ sha256: "A".repeat(64) })] },
      { saves: [listEntry({ uploadedAt: "1" })] }, { saves: [listEntry({ accountId: "9223372036854775808" })] }]) {
      expect(() => parseGameSaveList(bad)).toThrow(GameSaveError);
    }
  });
  test("maps account API statuses to error codes", async () => {
    await expect(listGameSaves(fetchOf(() => json({ error: "signed_out" }, 401)))).rejects.toMatchObject({ code: "signed_out" });
    await expect(listGameSaves(fetchOf(() => json({ error: "not_found" }, 404)))).rejects.toMatchObject({ code: "not_found" });
    await expect(listGameSaves(fetchOf(() => new Response("down", { status: 502 })))).rejects.toMatchObject({ code: "unavailable" });
    await expect(listGameSaves(fetchOf(() => { throw new TypeError("offline"); }))).rejects.toMatchObject({ code: "unavailable" });
    const requests: [string, RequestInit][] = [];
    expect(await listGameSaves(fetchOf((url, init) => { requests.push([url, init]); return json({ saves: [listEntry()] }); }))).toHaveLength(1);
    expect(requests[0]![0]).toBe("/api/me/saves");
    expect(requests[0]![1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  });
  test("save servers and paths follow the client builds", () => {
    expect(gameSaveServer("jp")).toBe("jp");
    expect(["tw", "kr", "en"].map(server => gameSaveServer(server as "tw"))).toEqual(["intl", "intl", "intl"]);
    expect(gameSavePath("intl", "20000000001")).toBe("/api/me/saves/intl/20000000001");
  });
  test("reads the SHA-256 an ETag names", () => {
    expect(etagSha256(`"${SHA_A}"`)).toBe(SHA_A);
    expect(etagSha256(`W/"${SHA_A}"`)).toBe(SHA_A);
    expect(etagSha256(SHA_A)).toBeNull();
    expect(etagSha256(null)).toBeNull();
  });
  test("a download is accepted only when its bytes hash to the ETag", async () => {
    const bytes = encoder.encode('{"_memberCards":[]}');
    const sha = await sha256Hex(bytes);
    const served = (etag: string | null) => fetchOf(() => new Response(bytes, { status: 200, headers: etag === null ? {} : { etag } }));
    expect(await downloadGameSave("intl", "20000000001", { fetch: served(`"${sha}"`) })).toEqual({ status: "ok", sha256: sha, bytes });
    await expect(downloadGameSave("intl", "20000000001", { fetch: served(`"${SHA_B}"`) })).rejects.toMatchObject({ code: "integrity" });
    await expect(downloadGameSave("intl", "20000000001", { fetch: served(null) })).rejects.toMatchObject({ code: "integrity" });
  });
  test("If-None-Match carries the held SHA-256 and 304 means unchanged", async () => {
    let header: string | null = null;
    const result = await downloadGameSave("jp", "1", { ifNoneMatch: SHA_A, fetch: fetchOf((_url, init) => {
      header = new Headers(init.headers).get("if-none-match"); return new Response(null, { status: 304 });
    }) });
    expect(result).toEqual({ status: "not-modified" });
    expect(header).toBe(`"${SHA_A}"`);
    await expect(downloadGameSave("jp", "1", { fetch: fetchOf(() => json({ error: "not_found" }, 404)) })).rejects.toMatchObject({ code: "not_found" });
    await expect(downloadGameSave("jp", "01")).rejects.toMatchObject({ code: "invalid" });
  });
  test("deleting expects 204", async () => {
    const methods: string[] = [];
    await deleteGameSave("intl", "20000000001", fetchOf((_url, init) => { methods.push(String(init.method)); return new Response(null, { status: 204 }); }));
    expect(methods).toEqual(["DELETE"]);
    await expect(deleteGameSave("intl", "20000000001", fetchOf(() => json({ error: "signed_out" }, 401)))).rejects.toMatchObject({ code: "signed_out" });
  });
  test("save text is strict UTF-8 without a byte-order mark", () => {
    expect(gameSaveText(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toBe("{}");
    expect(() => gameSaveText(new Uint8Array([0xff]))).toThrow(GameSaveError);
  });
});

describe("game save derivation", () => {
  const save = (player: Record<string, unknown>) => parseGameSave(JSON.stringify(player));
  const derive = (player: Record<string, unknown>, box: CardBox = createBox("tw", "box", 1)) => deriveGameSaveBox(box, link(), save(player), tables, null);

  test("levels follow the experience thresholds, rows read in experience order", () => {
    const rows = tables.memberLevels["1"];
    expect([0, 9, 10, 29, 30, 1_000_000].map(exp => levelByExp(rows, exp))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(levelByExp(rows, -1)).toBeNull();
    expect(levelByExp([[3, 25], [4, 20]], 22)).toBe(4);
    expect(expForLevel(rows, 2)).toBe(10);
    expect(expForLevel(rows, 9)).toBeNull();
    const { box } = derive({ _memberCards: [
      { _masterId: 101, _exp: 9, _awakeCount: 1, _rank: 1, _liveSkillLevel: 1, _performanceSkillLevel: 1 },
      { _masterId: "102", _exp: 5, _awakeCount: 5, _rank: 5, _liveSkillLevel: 5, _performanceSkillLevel: 3 },
    ], _supportCards: [{ _masterId: 201, _exp: 7, _rank: 4, _duplicateCount: 2 }] });
    expect(box.cards.map(card => [card.kind, card.identity.value, card.fields.level.value, card.fields.awake.value, card.fields.rank.value, card.fields.liveSkillLevel.value, card.fields.gekisouSkillLevel.value]))
      .toEqual([["member", "101", 1, 1, 1, 1, 1], ["member", "102", 2, 5, 5, 5, 3], ["snap", "201", 2, null, 4, null, null]]);
    expect(box.cards[0]!.fields.level).toMatchObject({ status: "observed", needsReview: false });
    expect(box.cards[0]!.fields.level.history[0]).toMatchObject({ source: "game-save", at: 1_700_000_000_000 });
    expect(box.coverage).toEqual({ member: { complete: true, declaredAt: 1_700_000_000_000 }, snap: { complete: true, declaredAt: 1_700_000_000_000 } });
  });

  test("an empty band item list is complete: every item is not built", () => {
    const { box, summary } = derive({ _bandItems: [] });
    expect(box.player.bandItemsComplete).toBe(true);
    expect(Object.fromEntries(Object.entries(box.player.bandItemStates).map(([id, field]) => [id, field.value]))).toEqual({ 501: "not-owned", 502: "not-owned" });
    expect(Object.values(box.player.bandItems).every(field => field.status === "unknown")).toBe(true);
    expect(summary.builtBandItems).toBe(0);
    const built = derive({ _bandItems: [{ _masterId: 501, _level: 2 }, { _masterId: 502, _level: 0 }] }).box.player;
    expect([built.bandItemStates["501"]!.value, built.bandItems["501"]!.value, built.bandItemStates["502"]!.value]).toEqual(["owned", 2, "not-owned"]);
  });

  test("unlisted characters have experience 0; listed ones reach the highest rank their experience allows", () => {
    const { box } = derive({ _characters: [{ _masterId: 1, _exp: 8 }, { _masterId: 3, _exp: 9 }] });
    expect(Object.fromEntries(Object.entries(box.player.characterRanks).map(([id, field]) => [id, field.value]))).toEqual({ 1: 2, 2: 1, 3: 3 });
    expect(box.player.characterCoverage).toBe("complete");
    expect(box.player.characterTotalRank.status).toBe("unknown");
  });

  test("unknown, duplicate and out-of-range entries are reported and stay out of the Box", () => {
    const { box, issues } = derive({
      _memberCards: [{ _masterId: 999, _exp: 0 }, { _masterId: 101, _exp: 0, _awakeCount: 6, _rank: 0 }, { _masterId: 101, _exp: 0 }, { _masterId: 1.5 }, { _masterId: 102, _exp: -1, _awakeCount: null }],
      _characters: [{ _masterId: 42, _exp: 1 }], _bandItems: [{ _masterId: 501, _level: 9 }],
    });
    expect(box.cards.map(card => card.identity.value)).toEqual(["101", "102"]);
    expect(box.cards[0]!.fields.awake.value).toBeNull();
    expect(box.cards[0]!.fields.rank.value).toBeNull();
    expect(box.cards[1]!.fields.level.value).toBeNull();
    const byPath = (list: readonly { path: string; code: string }[]) => [...list].sort((a, b) => a.path.localeCompare(b.path));
    expect(byPath(issues)).toEqual(byPath([
      { path: "_player._memberCards[0]._masterId", code: "unknown_id" },
      { path: "_player._memberCards[1]._awakeCount", code: "invalid_value" },
      { path: "_player._memberCards[1]._rank", code: "invalid_value" },
      { path: "_player._memberCards[2]._masterId", code: "duplicate_id" },
      { path: "_player._memberCards[3]._masterId", code: "invalid_value" },
      { path: "_player._memberCards[4]._exp", code: "invalid_value" },
      { path: "_player._characters[0]._masterId", code: "unknown_id" },
      { path: "_player._bandItems[0]._level", code: "invalid_value" },
    ]));
    expect(box.player.bandItemStates["501"]!.status).toBe("unknown");
  });

  test("memory unlocks and music ranks come from the save", () => {
    const { box, summary } = derive({ _memberCards: [{ _masterId: 101, _exp: 0 }], _memory: {
      _musicGroups: [{ _id: 7, _musics: [{ _id: 71, _unlockedScoreRank: 5 }] }],
      _members: [{ _id: 101, _unlocked: true }, { _id: 102, _unlocked: false }], _supports: [{ _id: 201, _unlocked: true }],
    } });
    expect(box.player.memory.value).toEqual({ musicRanks: { 71: 5 }, unlockedMembers: ["101"], unlockedSnaps: ["201"] });
    expect(summary).toMatchObject({ musicGroups: 1, memoryMembers: 2, memorySnaps: 1, unlockedMembers: 1, unlockedSnaps: 1 });
  });

  test("the Box's own facts stay stored and unused; VIP and events remain its own", () => {
    let stored = createBox("tw", "box", 1);
    const manual = createCard("member", "manual-card", "102", 2);
    manual.fields.level = answerField(manual.fields.level, { id: "level", value: 80, source: "manual", at: 3 });
    stored = { ...stored, cards: [manual], save: link() };
    stored.player.vipRank = answerField(stored.player.vipRank, { id: "vip", value: 4, source: "manual", at: 4 });
    const before = structuredClone(stored);
    const { box } = deriveGameSaveBox(stored, link(), save({ _memberCards: [{ _masterId: 101, _exp: 0 }] }), tables, null);
    expect(box.cards.map(card => card.identity.value)).toEqual(["101"]);
    expect(box.player.vipRank.value).toBe(4);
    expect(stored).toEqual(before);
    expect(() => parseBox(JSON.stringify(box))).toThrow();
    expect(unavailableGameSaveBox(stored).cards).toEqual([]);
    expect(gameSaveCounts(save({ _memberCards: [{}, {}], _supportCards: [{}] }))).toEqual({ members: 2, snaps: 1 });
  });

  test("a save that is not a JSON object is rejected", () => {
    expect(() => parseGameSave("[]")).toThrow();
    expect(() => parseGameSave("{")).toThrow();
  });
});

describe("card box save link", () => {
  test("Boxes without a save key read as unlinked; a link is checked", () => {
    const box = createBox("tw", "box", 1);
    const { save: _omitted, ...withoutSave } = box;
    expect(parseBox(JSON.stringify(withoutSave)).save).toBeNull();
    expect(parseBox(JSON.stringify({ ...box, save: link() })).save).toEqual(link());
    for (const save of [link({ server: "jp" }), link({ sha256: "x" }), link({ accountId: "0" }), link({ accountId: "9223372036854775808" }), { ...link(), profileId: "1" }, link({ uploadedAt: -1 })]) {
      expect(() => parseBox(JSON.stringify({ ...box, save }))).toThrow();
    }
    expect(parseBox(JSON.stringify({ ...createBox("jp", "jp-box", 1), save: link({ server: "jp", accountId: "9223372036854775807" }) })).save?.accountId).toBe("9223372036854775807");
  });
  test("other fields stay strict", () => {
    expect(() => parseBox(JSON.stringify({ ...createBox("tw", "box", 1), unknown: 1 }))).toThrow();
  });
});

describe("account envelope", () => {
  const target = { datasetId: DATASET, server: "intl" as const };
  test("a linked save becomes _player byte for byte, int64 literals included", () => {
    const text = '{"_accountid":9223372036854775000,"_memberCards":[{"_masterId":101,"_exp":12}],\n "_name":"x"}';
    const box = { ...createBox("tw", "box", 1), save: link() };
    box.player.vipRank = answerField(box.player.vipRank, { id: "vip", value: 7, source: "manual", at: 2 });
    const envelope = gameSaveAccountJson(target, box, { text, sha256: SHA_A });
    const prefix = envelope.indexOf('"account":{"_player":') + '"account":{"_player":'.length;
    expect(envelope.slice(prefix, prefix + text.length)).toBe(text);
    expect(envelope.endsWith(`${text}}}`)).toBe(true);
    expect(envelope).toContain("9223372036854775000");
    const parsed = JSON.parse(envelope);
    expect(parsed).toMatchObject({ format: "ournotes.account/1", datasetId: DATASET, server: "intl", revision: SHA_A, assumptions: [], declared: { _vip: { _rank: 7 } } });
    expect(Object.keys(parsed.coverage)).toEqual([...ACCOUNT_COVERAGE_PATHS]);
    expect(Object.values(parsed.coverage).every(value => value === "complete")).toBe(true);
    expect(Object.keys(parsed)).toEqual(["format", "datasetId", "server", "revision", "coverage", "assumptions", "declared", "account"]);
  });
  test("a save envelope needs the linked version, a matching server and a dataset hash", () => {
    const box = { ...createBox("tw", "box", 1), save: link() };
    expect(JSON.parse(gameSaveAccountJson(target, box, { text: "{}", sha256: SHA_A })).declared).toBeNull();
    expect(() => gameSaveAccountJson(target, box, { text: "{}", sha256: SHA_B })).toThrow();
    expect(() => gameSaveAccountJson({ ...target, server: "jp" }, box, { text: "{}", sha256: SHA_A })).toThrow();
    expect(() => gameSaveAccountJson({ ...target, datasetId: "C".repeat(64) }, box, { text: "{}", sha256: SHA_A })).toThrow();
    expect(() => gameSaveAccountJson(target, box, { text: "[1]", sha256: SHA_A })).toThrow();
  });
  test("a screenshot or manual Box is assembled with null unknowns, threshold experience and declared coverage", () => {
    const box = createBox("tw", "box", 1);
    const member = createCard("member", "m", "101", 2);
    member.fields.level = { status: "observed", value: 2, needsReview: false, history: [{ id: "shot", value: 2, source: "screenshot", at: 3, screenshot: { sourceId: "img", bbox: [0, 0, 1, 1] } }] };
    member.fields.rank = answerField(member.fields.rank, { id: "rank", value: 3, source: "manual", at: 3 });
    const snap = createCard("snap", "s", "201", 2);
    const unknownIdentity = createCard("member", "u", null, 2);
    box.cards = [member, snap, unknownIdentity];
    box.coverage.member = { complete: true, declaredAt: 5 };
    box.player.characterRanks = { 2: answerField(box.player.characterRanks["2"] ?? { status: "unknown", value: null, history: [], needsReview: false }, { id: "c2", value: 3, source: "manual", at: 4 }) };
    box.player.characterCoverage = "complete";
    box.player.bandItemStates = { 501: answerField({ status: "unknown", value: null, history: [], needsReview: false }, { id: "b", value: "not-owned", source: "manual", at: 4 }) };
    const envelope = boxAccountJson(target, box, tables);
    const parsed = JSON.parse(envelope);
    expect(parsed.revision).toBe("box:box:0");
    expect(parsed.declared).toBeNull();
    expect(parsed.account._player._memberCards).toEqual([{ _masterId: 101, _exp: 10, _awakeCount: null, _rank: 3, _liveSkillLevel: null, _performanceSkillLevel: null }]);
    expect(parsed.account._player._supportCards).toEqual([{ _masterId: 201, _exp: null, _rank: null }]);
    expect(parsed.account._player._characters).toEqual([{ _masterId: 1, _exp: null }, { _masterId: 2, _exp: 9 }, { _masterId: 3, _exp: null }]);
    expect(parsed.account._player._bandItems).toEqual([{ _masterId: 501, _level: 0 }]);
    expect(parsed.account._player._memory).toEqual({ _musicGroups: [], _members: [], _supports: [] });
    expect(parsed.coverage).toEqual({ "_player._memberCards": "complete", "_player._supportCards": "partial", "_player._characters": "complete", "_player._bandItems": "partial",
      "_player._memory._musicGroups": "partial", "_player._memory._members": "partial", "_player._memory._supports": "partial" });
    expect(parsed.assumptions).toEqual([
      { path: "_player._memberCards[0]._exp", reason: "Level 2 read from a screenshot; experience is that level's threshold" },
      { path: "_player._characters[1]._exp", reason: "Character rank 3 entered manually; experience is that rank's threshold" },
    ]);
  });
  test("IDs are written as exact integer tokens and a linked Box is not assembled from its own facts", () => {
    const box = createBox("tw", "box", 1);
    box.player.bandItems = { "9223372036854775807": answerField({ status: "unknown", value: null, history: [], needsReview: false }, { id: "b", value: 1, source: "manual", at: 1 }) };
    expect(boxAccountJson(target, box, tables)).toContain('{"_masterId":9223372036854775807,"_level":1}');
    expect(() => boxAccountJson(target, { ...box, save: link() }, tables)).toThrow();
    expect(() => boxAccountJson({ ...target, server: "jp" }, box, tables)).toThrow();
  });
});

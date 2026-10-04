import { describe, expect, test } from "bun:test";
import { createBox, createCard } from "../src/lib/box/model";
import { groupIssues, isOutOfMemory, issueTarget, parseDeckAnswer } from "../src/lib/deck/answer";

const team = (score: number) => ({
  rank: 1, leader: { member: 3, snap: 30 }, others: [{ member: 1, snap: null }, { member: 2, snap: 20 }, { member: 4, snap: null }, { member: 5, snap: null }],
  power: 120000, value: { score, exact: { numerator: String(score * 120), denominator: "120" }, interval: null, payoff: null },
  orders: { count: 120, min: { score: score - 10, order: [1, 2, 3, 4, 5] }, median: { score, order: [2, 1, 3, 4, 5] }, max: { score: score + 10, order: [5, 4, 3, 2, 1] },
    best: { score: score + 10, payoff: null, order: [5, 4, 3, 2, 1] }, values: [] },
  layout: { members: [1, 2, 3, 4, 5], snaps: [null, 20, 30, null, null] },
});
const answer = (patch: Record<string, unknown>) => JSON.stringify({ format: "ournotes-deck.account-recommendation/1", datasetId: "a".repeat(64), final: true,
  status: "ok", missing: [], errors: [], result: { phase: "done", elapsedMs: 1700, optimality: { proven: true, lowerBound: 1000, upperBound: 1000, bestGap: 0, kthGap: 0, fraction: 1 },
    teams: [team(1000)], account: { cards: { coversAllOwnedCards: true } } }, ...patch });

describe("answer", () => {
  test("reads teams, optimality and the layout", () => {
    const parsed = parseDeckAnswer(answer({}));
    expect(parsed.status).toBe("ok");
    expect(parsed.result?.optimality.proven).toBe(true);
    expect(parsed.result?.teams[0]?.layout.members[2]).toBe(3);
    expect(parsed.result?.teams[0]?.orders?.median.score).toBe(1000);
    expect(parsed.result?.coversAllOwnedCards).toBe(true);
  });
  test("a progress report without orders and a partial box", () => {
    const parsed = parseDeckAnswer(answer({ final: false, result: { phase: "proof", elapsedMs: 300, optimality: { proven: false, lowerBound: 900, upperBound: 1100, bestGap: 0.22, fraction: 0.4 },
      teams: [{ ...team(900), orders: null }], account: { cards: { coversAllOwnedCards: false } } } }));
    expect(parsed.final).toBe(false);
    expect(parsed.result?.phase).toBe("proof");
    expect(parsed.result?.teams[0]?.orders).toBeNull();
    expect(parsed.result?.coversAllOwnedCards).toBe(false);
  });
  test("rejects other formats and unknown statuses", () => {
    expect(() => parseDeckAnswer(JSON.stringify({ format: "other" }))).toThrow();
    expect(() => parseDeckAnswer(answer({ status: "maybe" }))).toThrow();
  });
  test("tells an out-of-memory trap", () => {
    expect(isOutOfMemory("RuntimeError: unreachable executed")).toBe(false);
    expect(isOutOfMemory("RangeError: WebAssembly.Memory.grow(): Maximum memory size exceeded")).toBe(true);
  });
});

describe("issues", () => {
  const box = { ...createBox("tw", "box"), cards: [createCard("member", "m61", "61"), createCard("snap", "s70", "70")] };
  test("map card paths through the _masterId the message names", () => {
    expect(issueTarget({ path: "_player._memberCards[3]._liveSkillLevel", code: "missing", message: "member card _masterId 61: the selected goal reads this value" }, box))
      .toMatchObject({ kind: "card", cardKind: "member", masterId: "61", field: "liveSkillLevel" });
    expect(issueTarget({ path: "_player._supportCards[0]._exp", code: "missing", message: "support card _masterId 70" }, box)).toMatchObject({ kind: "card", cardKind: "snap", field: "level" });
    expect(issueTarget({ path: "declared._vip._rank", code: "missing", message: "" }, box)).toEqual({ kind: "vip" });
    expect(issueTarget({ path: "_player._characters[2]._exp", code: "missing", message: "" }, box)).toEqual({ kind: "player", area: "characters" });
    expect(issueTarget({ path: "goal.difficulty", code: "input", message: "" }, box)).toEqual({ kind: "request" });
  });
  test("group per card in box order", () => {
    const parsed = parseDeckAnswer(answer({ status: "incomplete", result: null, missing: [
      { path: "_player._supportCards[0]._rank", code: "missing", message: "_masterId 70" },
      { path: "_player._memberCards[0]._liveSkillLevel", code: "missing", message: "_masterId 61" },
      { path: "_player._memberCards[0]._performanceSkillLevel", code: "missing", message: "_masterId 61" },
      { path: "declared._vip._rank", code: "missing", message: "" }] }));
    const groups = groupIssues(parsed, box);
    expect(groups.cards.map(entry => entry.masterId)).toEqual(["61", "70"]);
    expect(groups.cards[0]?.fields).toEqual(["liveSkillLevel", "gekisouSkillLevel"]);
    expect(groups.vip).toHaveLength(1);
  });
});

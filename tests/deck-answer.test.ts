import { describe, expect, test } from "bun:test";
import { createBox, createCard } from "../src/lib/box/model";
import { groupIssues, isOutOfMemory, issueTarget, parseDeckAnswer } from "../src/lib/deck/answer";
import { formatDeckInterval, parseInterval } from "../src/lib/deck/interval";

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
    expect(parsed.result?.aggregation).toBe("expected");
    expect(parsed.result?.exitReason).toBeNull();
  });
  test("retains the engine exit reason independently of the configured time limit", () => {
    for (const exitReason of ["timeLimit", "refinementRequired", "complete"]) {
      const raw = JSON.parse(answer({}));
      raw.result.exitReason = exitReason;
      expect(parseDeckAnswer(JSON.stringify(raw)).result?.exitReason).toBe(exitReason);
    }
  });
  test("reads the echoed maximum objective and its maximizing order in progress and final results", () => {
    for (const final of [false, true]) {
      const raw = JSON.parse(answer({ final }));
      raw.result.aggregation = "maximum";
      raw.result.goal = { kind: "battleLive" };
      raw.result.teams[0].orders = null;
      raw.result.teams[0].bestOrder = { score: 1200, payoff: null, order: [5, 4, 3, 2, 1] };
      const parsed = parseDeckAnswer(JSON.stringify(raw));
      expect(parsed.result?.aggregation).toBe("maximum");
      expect(parsed.result?.goalKind).toBe("battleLive");
      expect(parsed.result?.teams[0]?.bestOrder?.order).toEqual([5, 4, 3, 2, 1]);
      expect(parsed.result?.teams[0]?.orders).toBeNull();
      raw.result.aggregation = "unsupported";
      expect(() => parseDeckAnswer(JSON.stringify(raw))).toThrow("Unknown result aggregation");
    }
  });
  test("a progress report without orders and a partial box", () => {
    const parsed = parseDeckAnswer(answer({ final: false, result: { phase: "proof", elapsedMs: 300, optimality: { proven: false, lowerBound: 900, upperBound: 1100, bestGap: 0.22, fraction: 0.4 },
      teams: [{ ...team(900), orders: null }], account: { cards: { coversAllOwnedCards: false } } } }));
    expect(parsed.final).toBe(false);
    expect(parsed.result?.phase).toBe("proof");
    expect(parsed.result?.teams[0]?.orders).toBeNull();
    expect(parsed.result?.coversAllOwnedCards).toBe(false);
  });
  test("keeps null exact values, certified rational score/payoff intervals and absent orders", () => {
    const raw = JSON.parse(answer({}));
    raw.result.optimality.proven = false;
    raw.result.teams = [{ ...team(1000), rankCertified: false, orders: null,
      value: { score: 1000, exact: null, interval: { lower: { numerator: "3001", denominator: "3" }, upper: { numerator: "2003", denominator: "2" } },
        payoff: { score: 1 / 3, exact: null, interval: { lower: { numerator: "1", denominator: "3" }, upper: { numerator: "1", denominator: "3" } } } } }];
    const parsed = parseDeckAnswer(JSON.stringify(raw));
    const result = parsed.result!.teams[0]!;
    expect(parsed.result!.optimality.proven).toBe(false);
    expect(result.rankCertified).toBe(false);
    expect(result.orders).toBeNull();
    expect(result.value!.exact).toBeNull();
    expect(result.value!.payoff!.exact).toBeNull();
    expect(result.value!.interval!.exact.lower).toEqual({ numerator: "3001", denominator: "3" });
    expect(formatDeckInterval(result.value!.interval!, "en-US", 0)).toBe("1,000 – 1,002");
    expect(formatDeckInterval(result.value!.payoff!.interval!, "en-US", 2)).toBe("0.33 – 0.34");
  });
  test("legacy ranks inherit a completed proof, explicit false wins, and a rank proof never promotes completion", () => {
    const raw = JSON.parse(answer({}));
    expect(parseDeckAnswer(JSON.stringify(raw)).result!.teams[0]!.rankCertified).toBe(true);
    raw.result.teams[0].rankCertified = false;
    expect(parseDeckAnswer(JSON.stringify(raw)).result!.teams[0]!.rankCertified).toBe(false);
    raw.result.optimality.proven = false;
    delete raw.result.teams[0].rankCertified;
    expect(parseDeckAnswer(JSON.stringify(raw)).result!.teams[0]!.rankCertified).toBe(false);
    raw.result.teams[0].rankCertified = true;
    const parsed = parseDeckAnswer(JSON.stringify(raw));
    expect(parsed.result!.teams[0]!.rankCertified).toBe(true);
    expect(parsed.result!.optimality.proven).toBe(false);
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

describe("certificate boundaries", () => {
  const fraction = (n: bigint, d: bigint) => ({ numerator: String(n), denominator: String(d) });
  test("binary subnormal endpoints survive an overflowing denominator", () => {
    const point = fraction(1n, 1n << 1074n);
    const interval = parseInterval({ lower: point, upper: point })!;
    expect(interval.lower).toBe(Number.MIN_VALUE);
    expect(interval.upper).toBe(Number.MIN_VALUE);
    expect(formatDeckInterval(interval, "en-US", 2)).toBe("4.94e-324 – 4.941e-324");
  });
  test("values below the subnormal range enclose zero numerically but stay visible in exact display", () => {
    const interval = parseInterval({ lower: fraction(1n, 1n << 1075n), upper: fraction(1n, 1n << 1074n) })!;
    expect(interval.lower).toBe(0);
    expect(interval.upper).toBe(Number.MIN_VALUE);
    expect(formatDeckInterval(interval, "en-US", 2)).toBe("2.47e-324 – 4.941e-324");
  });
  test("strict ordering is checked before lossy conversion, and invalid certificates are rejected", () => {
    expect(() => parseInterval({ lower: fraction(3n, 1n << 1076n), upper: fraction(1n, 1n << 1075n) })).toThrow("Inverted");
    expect(() => parseInterval({ lower: fraction(1n, 0n), upper: 1 })).toThrow();
    expect(() => parseInterval({ lower: 2, upper: 1 })).toThrow();
  });
  test("positive and negative rounding stays outward, including a fraction just above a float", () => {
    const n = (1n << 53n) + 1n, d = 1n << 53n;
    const positive = parseInterval({ lower: fraction(n, d), upper: fraction(n, d) })!;
    expect(positive.lower).toBe(1);
    expect(positive.upper).toBe(1 + Number.EPSILON);
    const negative = parseInterval({ lower: fraction(-n, d), upper: fraction(-n, d) })!;
    expect(negative.lower).toBe(-1 - Number.EPSILON);
    expect(negative.upper).toBe(-1);
    expect(formatDeckInterval(negative, "en-US", 2)).toBe("-1.01 – -1");
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
    expect(issueTarget({ path: "aggregation", code: "input", message: "" }, box)).toEqual({ kind: "request" });
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

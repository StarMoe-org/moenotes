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


describe("challenge-point priority answers", () => {
  const payoff = (numerator: string, denominator = "1") => ({ score: Number(numerator) / Number(denominator), exact: { numerator, denominator }, interval: null });
  const combo = (secondaryPriority = "eventPointsFirst") => {
    const raw = JSON.parse(answer({}));
    raw.result.metric = { kind: "challengePoints", eventId: 7, consumption: 3, secondaryPriority, resourceType: 1, resourceId: 90 };
    raw.result.aggregation = "expected";
    raw.result.teams[0].value.payoff = payoff("151", "2");
    raw.result.teams[0].eventRewards = { challengePoints: payoff("151", "2"), eventPoints: payoff("901", "3"), eventItems: payoff("9007199254740993", "9007199254740992") };
    return raw;
  };
  test("retains the echoed priority, badge resource and exact rewards with fewer than five teams", () => {
    for (const priority of ["eventPointsFirst", "eventItemsFirst"]) for (const count of [0, 1, 3]) {
      const raw = combo(priority);
      raw.result.teams = Array.from({ length: count }, (_, i) => ({ ...raw.result.teams[0], rank: i + 1 }));
      const result = parseDeckAnswer(JSON.stringify(raw)).result!;
      expect(result.secondaryPriority).toBe(priority);
      expect(result.resourceType).toBe(1);
      expect(result.resourceId).toBe(90);
      expect(result.teams).toHaveLength(count);
      expect(result.optimality.proven).toBe(true);
      if (count) {
        expect(result.teams[0]!.value!.payoff!.score).toBe(75.5);
        expect(result.teams[0]!.eventRewards!.eventItems.exact.numerator).toBe("9007199254740993");
        expect(result.teams[0]!.eventRewards!.eventPoints.exact).toEqual({ numerator: "901", denominator: "3" });
      }
    }
  });
  test("missing or malformed combined rewards are protocol errors in progress and final answers", () => {
    for (const final of [false, true]) {
      for (const field of ["challengePoints", "eventPoints", "eventItems", "all"]) {
        const raw = combo(); raw.final = final;
        if (field === "all") delete raw.result.teams[0].eventRewards;
        else delete raw.result.teams[0].eventRewards[field];
        expect(() => parseDeckAnswer(JSON.stringify(raw))).toThrow();
      }
      for (const patch of [{ exact: null }, { exact: { numerator: "1", denominator: "0" } }, { score: "12" }, { interval: { lower: 1, upper: 2 } }]) {
        const raw = combo(); raw.final = final;
        Object.assign(raw.result.teams[0].eventRewards.eventPoints, patch);
        expect(() => parseDeckAnswer(JSON.stringify(raw))).toThrow();
      }
    }
  });
  test("malformed priority metadata and a missing CP primary payoff are rejected", () => {
    for (const patch of [{ secondaryPriority: "unknown" }, { resourceType: 2 }, { resourceId: 0 }, { kind: "eventPoints" }]) {
      const raw = combo(); Object.assign(raw.result.metric, patch);
      expect(() => parseDeckAnswer(JSON.stringify(raw))).toThrow();
    }
    const maximum = combo(); maximum.result.aggregation = "maximum";
    expect(() => parseDeckAnswer(JSON.stringify(maximum))).toThrow();
    const absent = combo(); absent.result.teams[0].value.payoff = null;
    expect(() => parseDeckAnswer(JSON.stringify(absent))).toThrow();
  });
  test("timeouts remain unproven and non-combined answers keep their existing shape", () => {
    const raw = combo(); raw.result.optimality.proven = false; raw.result.exitReason = "timeLimit";
    expect(parseDeckAnswer(JSON.stringify(raw)).result!.optimality.proven).toBe(false);
    expect(parseDeckAnswer(JSON.stringify(raw)).result!.exitReason).toBe("timeLimit");
    const plain = JSON.parse(answer({})); plain.result.metric = { kind: "challengePoints" };
    const result = parseDeckAnswer(JSON.stringify(plain)).result!;
    expect(result.secondaryPriority).toBeUndefined();
    expect(result.teams[0]!.eventRewards).toBeUndefined();
  });
});

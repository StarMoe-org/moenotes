import { describe, expect, test } from "bun:test";
import { computes, computesGoal, defaultDeckGoalInput, effectiveAggregation, goalGap, heldEvent, jstTicks, parseCapabilities, recommendationRequest, type DeckEvent, type DeckGoalInput } from "../src/lib/deck/goals";
import { challengeRateRequest, mixableRewards, rewardLayoutOf, usesChallengeRate, usesEventItemRewards } from "../src/lib/deck/goals";
import { defaultRewardPlan, rewardLayout, rewardLevels, rewardShares, statedTerms, withFirstTieBreak, withMainReward, withRewardRate, withRewardRole,
  type EventReward, type RewardPlan, type RewardRole } from "../src/lib/deck/reward-mix";
import { parseMasterDate } from "../src/lib/schedule";

const event: DeckEvent = { id: 7, name: "Event", startAt: "2030/01/01 15:00:00+08:00", endAt: "2030/01/09 20:59:59+08:00", itemId: 90,
  challengeMusics: [{ id: 1, musicId: 100 }, { id: 2, musicId: 200 }] };
const none = { includeMembers: [], excludeMembers: [], excludeSnaps: [] };
const now = Date.parse("2030-01-05T00:00:00Z");
const request = (patch: Partial<DeckGoalInput>, held: DeckEvent | null = event) =>
  JSON.parse(recommendationRequest({ ...defaultDeckGoalInput(), ...patch }, { event: held, now, constraints: none }));

describe("held event", () => {
  test("is the event whose window contains now, ending first among several", () => {
    const later = { ...event, id: 8, endAt: "2030/02/01 00:00:00+08:00" };
    expect(heldEvent([later, event], now, parseMasterDate)?.id).toBe(7);
    expect(heldEvent([event], Date.parse("2030-01-09T12:59:58Z"), parseMasterDate)?.id).toBe(7);
    expect(heldEvent([event], Date.parse("2030-01-09T12:59:59Z"), parseMasterDate)).toBeNull();
    expect(heldEvent([event], Date.parse("2029-12-31T00:00:00Z"), parseMasterDate)).toBeNull();
  });
});

describe("recommendation request", () => {
  test("maximum changes only the aggregation and preserves the declared play, pool and event conditions", () => {
    const input = { ...defaultDeckGoalInput("eventPoints"), venue: "freeLive" as const, musicId: 245, boosts: 3,
      playMode: "pattern" as const, missEvery: 17, greatPercent: 7, justPercent: 81, othersAverageScore: 120000 };
    const context = { event, now, constraints: { includeMembers: ["61"], excludeMembers: ["62"], excludeSnaps: ["70"] } };
    const expected = JSON.parse(recommendationRequest(input, context));
    const maximum = JSON.parse(recommendationRequest({ ...input, aggregation: "maximum" }, context));
    expect(input.aggregation).toBe("expected");
    expect(expected.aggregation).toBeUndefined();
    expect(maximum).toEqual({ ...expected, aggregation: "maximum" });
    expect(maximum.goal.play).toEqual({ kind: "pattern", greatFraction: 0.07, justFraction: 0, missEvery: 17 });
  });
  test("deterministic goals keep one value while preserving the player's live objective preference", () => {
    for (const goal of ["power", "skip", "challengeSkip"] as const) {
      const input = { ...defaultDeckGoalInput(goal), aggregation: "maximum" as const, musicId: 245, challengeMusicId: 1 };
      expect(effectiveAggregation(input)).toBe("expected");
      expect(request(input).aggregation).toBeUndefined();
      expect(input.aggregation).toBe("maximum");
      expect(effectiveAggregation({ ...input, goal: "free" })).toBe("maximum");
    }
    expect(request({ goal: "eventPoints", venue: "skip", musicId: 245, aggregation: "maximum" }).aggregation).toBeUndefined();
  });
  test("Gekisou scenes use Expected and returning to Free Live restores the objective preference", () => {
    const stored = { ...defaultDeckGoalInput("free"), musicId: 245, arenaMusicId: 42, aggregation: "maximum" as const,
      playMode: "pattern" as const, greatPercent: 7, justPercent: 81, missEvery: 17 };
    expect(effectiveAggregation(stored)).toBe("maximum");
    for (const goal of ["battle", "mission", "arena"] as const) {
      const selected = { ...stored, goal };
      expect(effectiveAggregation(selected)).toBe("expected");
      expect(request(selected)).toEqual(request({ ...selected, aggregation: "expected" }));
      expect(selected.aggregation).toBe("maximum");
      expect(selected.greatPercent).toBe(7);
      expect(selected.justPercent).toBe(81);
      expect(selected.missEvery).toBe(17);
      expect(request({ ...selected, goal: "free" }).aggregation).toBe("maximum");
    }
  });
  test("event payoff venues retain Maximum only for non-Gekisou played lives", () => {
    for (const goal of ["eventPoints", "eventItems", "challengePoints"] as const) {
      for (const venue of ["battleLive", "missionLive", "arenaLive", "freeLive", "challengeLive", "skip", "challengeSkip"] as const) {
        if (goal === "challengePoints" && (venue === "challengeLive" || venue === "challengeSkip")) continue;
        const input = { ...defaultDeckGoalInput(goal), venue, musicId: 245, arenaMusicId: 42, challengeMusicId: 1,
          aggregation: "maximum" as const };
        const available = venue === "freeLive" || venue === "challengeLive";
        expect(effectiveAggregation(input)).toBe(available ? "maximum" : "expected");
        expect(request(input).aggregation).toBe(available ? "maximum" : undefined);
        expect(input.aggregation).toBe("maximum");
      }
    }
    expect(request({ goal: "challenge", challengeMusicId: 1, aggregation: "maximum" }).aggregation).toBe("maximum");
  });
  test("a battle live sends Great and Just, rank 1 and the score metric", () => {
    const body = request({ goal: "battle", musicId: 245, difficulty: "expert", greatPercent: 3, justPercent: 95 });
    expect(body.format).toBe("ournotes-deck.recommendation-request/2");
    expect(body.goal).toEqual({ kind: "battleLive", musicId: 245, difficulty: "expert", rank: 1, accuracy: { greatFraction: 0.03, justFraction: 0.95 } });
    expect(body.metric).toEqual({ kind: "score" });
    expect(body.eventIds).toEqual([]);
    expect(body.limits).toEqual({ timeLimitMs: 60000 });
    expect(body.k).toBe(5);
  });
  test("a live without gekisou sends Great only", () => {
    expect(request({ goal: "free", musicId: 245, greatPercent: 3, justPercent: 95 }).goal.accuracy).toEqual({ greatFraction: 0.03 });
    expect(request({ goal: "challenge", challengeMusicId: 2 }).goal).toEqual({ kind: "challengeLive", challengeMusicId: 2, difficulty: "expert", accuracy: { greatFraction: 0 } });
  });
  test("power names the song only when asked and counts the event only while one is held", () => {
    expect(request({ goal: "power", musicId: 245 }).goal).toEqual({ kind: "power", eventParameter: true });
    expect(request({ goal: "power", musicId: 245, powerSong: true }).goal).toEqual({ kind: "power", musicId: 245, eventParameter: true });
    expect(request({ goal: "power" }, null).goal).toEqual({ kind: "power", eventParameter: false });
    expect(request({ goal: "power" }).metric).toBeUndefined();
  });
  test("only event objectives and event-boosted power send the held event ID", () => {
    for (const goal of ["battle", "mission", "arena", "free", "skip"] as const) {
      expect(request({ goal, musicId: 100, arenaMusicId: 42 }).eventIds).toEqual([]);
    }
    expect(request({ goal: "power", eventParameter: false }).eventIds).toEqual([]);
    expect(request({ goal: "power", eventParameter: true }).eventIds).toEqual([7]);
    for (const goal of ["challenge", "challengeSkip", "eventPoints", "challengePoints"] as const) {
      expect(request({ goal, musicId: 100, challengeMusicId: 1 }).eventIds).toEqual([7]);
    }
    expect(request({ goal: "eventItems", musicId: 100 }).eventIds).toEqual([7]);
  });
  test("event points carry the event, the consumption and the result clock", () => {
    const body = request({ goal: "eventPoints", venue: "freeLive", musicId: 245, boosts: 3 });
    expect(body.metric).toEqual({ kind: "eventPoints", eventId: 7, consumption: 3 });
    expect(body.eventContext.resultClock.kind).toBe("played");
    expect(body.eventContext.rewardProjection).toBe(true);
    expect(body.room).toBeUndefined();
    const challenge = request({ goal: "eventItems", venue: "challengeLive", challengeMusicId: 1, challengePoints: 800 });
    expect(challenge.metric).toEqual({ kind: "eventItems", eventId: 7, resourceType: 1, resourceId: 90, consumption: 800 });
    const battle = request({ goal: "eventPoints", venue: "battleLive", musicId: 245 });
    expect(battle.room).toEqual({ players: 5, othersAverageScore: null });
    expect(request({ goal: "eventPoints", venue: "skip", musicId: 245 }).eventContext.resultClock.kind).toBe("skip");
  });
  test("challenge points use ordinary result ranks and the chosen Live Boost consumption", () => {
    for (const venue of ["freeLive", "battleLive", "skip"] as const) {
      const body = request({ goal: "challengePoints", venue, musicId: 245, boosts: 3 });
      expect(body.goal.kind).toBe(venue);
      expect(body.metric).toEqual({ kind: "challengePoints", eventId: 7, consumption: 3 });
      expect(body.eventContext.resultClock.kind).toBe(venue === "skip" ? "skip" : "played");
      expect(body.eventContext.rewardProjection).toBe(true);
      expect(body.eventContext.localEvents).toBeUndefined();
    }
    expect(() => request({ goal: "challengePoints", venue: "challengeLive", challengeMusicId: 1 })).toThrow();
  });
  test("the event song ranking is the challenge song's score, without a PT consumption metric", () => {
    const body = request({ goal: "challenge", challengeMusicId: 2, difficulty: "hard", boosts: 10, challengePoints: 1600 });
    expect(body.goal).toMatchObject({ kind: "challengeLive", challengeMusicId: 2, difficulty: "hard" });
    expect(body.metric).toEqual({ kind: "score" });
    expect(body.eventIds).toEqual([7]);
    expect(body.eventContext).toBeUndefined();
  });
  test("the result clock is in JST DateTime ticks", () => {
    expect(jstTicks(0)).toBe(String(621_355_968_000_000_000n + 9n * 3_600_000n * 10_000n));
  });
  test("constraints carry master IDs and the text keeps them as written", () => {
    const text = recommendationRequest({ ...defaultDeckGoalInput("free"), musicId: 1 }, { event: null, now,
      constraints: { includeMembers: ["61"], excludeMembers: ["2", "3"], excludeSnaps: ["70"] } });
    expect(JSON.parse(text).constraints).toEqual({ leader: null, includeMembers: [61], excludeMembers: [2, 3], excludeSnaps: [70], noSnaps: false });
    expect(() => recommendationRequest({ ...defaultDeckGoalInput("free"), musicId: 1 }, { event: null, now, constraints: { ...none, excludeSnaps: ["x"] } })).toThrow();
  });
  test("a goal with a gap cannot be built", () => {
    expect(goalGap({ ...defaultDeckGoalInput("battle") }, null)).toBe("song");
    expect(goalGap({ ...defaultDeckGoalInput("eventPoints"), musicId: 1 }, null)).toBe("event");
    expect(goalGap({ ...defaultDeckGoalInput("challenge"), challengeMusicId: 9 }, event)).toBe("challengeSong");
    expect(goalGap({ ...defaultDeckGoalInput("eventItems"), musicId: 1 }, { ...event, itemId: null })).toBe("eventItem");
    expect(goalGap(defaultDeckGoalInput("power"), null)).toBeNull();
    expect(() => request({ goal: "battle" })).toThrow();
  });
});

describe("capabilities", () => {
  const capabilities = parseCapabilities(JSON.stringify({ goals: ["freeLive", "power"], metrics: { freeLive: ["score", "eventPoints"], power: [] }, accuracy: { great: false, just: false } }))!;
  test("decide which goals and venues run", () => {
    expect(computesGoal(capabilities, "free")).toBe(true);
    expect(computesGoal(capabilities, "power")).toBe(true);
    expect(computesGoal(capabilities, "battle")).toBe(false);
    expect(computesGoal(capabilities, "challenge")).toBe(false);
    expect(computesGoal(capabilities, "eventPoints")).toBe(true);
    expect(computesGoal(capabilities, "eventItems")).toBe(false);
    expect(computes(capabilities, { goal: "eventPoints", venue: "skip" })).toBe(false);
    expect(capabilities.accuracy).toEqual({ great: false, just: false });
  });
  test("event items require the complete exact-grade capability for every scene and aggregation", () => {
    const eventItemRewards = { selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000 };
    const metrics = { freeLive: ["eventItems", "eventPoints", "challengePoints"], challengeLive: ["eventItems"], skip: ["eventItems"] };
    const raw = { goals: Object.keys(metrics), metrics, aggregations: { maximum: metrics }, accuracy: { great: true, just: true } };
    const variants = [undefined, null, {}, { ...eventItemRewards, selection: "cumulative" },
      { ...eventItemRewards, eventGroupField: "group" }, { ...eventItemRewards, rowsPerGrade: 2 },
      { ...eventItemRewards, probabilityMarker: 100 }, { ...eventItemRewards, probabilityMarker: "10000" }, eventItemRewards];
    for (const contract of variants) {
      const cap = parseCapabilities(JSON.stringify({ ...raw, eventItemRewards: contract }))!;
      const accepted = contract === eventItemRewards;
      expect(computesGoal(cap, "eventItems")).toBe(accepted);
      for (const venue of ["freeLive", "challengeLive", "skip", "challengeSkip"] as const) {
        for (const aggregation of ["expected", "maximum"] as const) {
          expect(computes(cap, { goal: "eventItems", venue, aggregation })).toBe(accepted);
        }
      }
      expect(computesGoal(cap, "eventPoints")).toBe(true);
      expect(computesGoal(cap, "challengePoints")).toBe(true);
    }
    expect(computesGoal(parseCapabilities(JSON.stringify({ ...raw, metrics: {}, aggregations: {}, eventItemRewards }))!, "eventItems")).toBe(false);
  });
  test("an engine without capabilities reports none", () => {
    expect(parseCapabilities(null)).toBeNull();
    expect(parseCapabilities("not json")).toBeNull();
  });
  test("maximum requires support for both the chosen scene and metric and preserves play restrictions", () => {
    const legacy = { goals: ["freeLive", "battleLive"], metrics: { freeLive: ["score", "eventPoints"], battleLive: ["score"] }, accuracy: { great: false, just: false } };
    const input = { ...defaultDeckGoalInput("free"), musicId: 100, aggregation: "maximum" as const };
    expect(computes(parseCapabilities(JSON.stringify(legacy))!, input)).toBe(false);
    const cap = parseCapabilities(JSON.stringify({ ...legacy, aggregations: { maximum: { freeLive: ["score"] } } }))!;
    expect(computes(cap, input)).toBe(true);
    expect(computes(cap, { ...input, goal: "eventPoints" })).toBe(false);
    expect(computes(cap, { ...input, goal: "battle" })).toBe(true);
    expect(computes(cap, { ...input, greatPercent: 5 })).toBe(false);
    expect(computes(cap, { ...input, playMode: "pattern" })).toBe(false);
    expect(computes(cap, { ...input, goal: "eventPoints", aggregation: "expected" })).toBe(true);
    expect(input.aggregation).toBe("maximum");
  });
});


describe("all public scene and objective inputs", () => {
  test("mission and arena keep their distinct scene IDs and Just rules", () => {
    expect(request({ goal: "mission", musicId: 100 }).goal).toEqual({ kind: "missionLive", musicId: 100, difficulty: "expert", accuracy: { greatFraction: 0, justFraction: 1 } });
    const arena = request({ goal: "arena", arenaMusicId: 42, musicId: 100 });
    expect(arena.goal.arenaMusicId).toBe(42);
    expect(arena.goal.musicId).toBeUndefined();
    expect(arena.goal.rank).toBe(1);
    expect(goalGap({ ...defaultDeckGoalInput("arena"), musicId: 100 }, null)).toBe("arenaSong");
  });
  test("challenge Skip spends CP and never requests CP earnings", () => {
    const body = request({ goal: "eventPoints", venue: "challengeSkip", challengeMusicId: 1, challengePoints: 800, boosts: 3 });
    expect(body.goal).toEqual({ kind: "skip", challengeMusicId: 1, difficulty: "expert" });
    expect(body.metric.consumption).toBe(800);
    expect(body.eventContext.resultClock.kind).toBe("skip");
    expect(() => request({ goal: "challengePoints", venue: "challengeSkip", challengeMusicId: 1 })).toThrow();
    expect(request({ goal: "challengeSkip", challengeMusicId: 1 }).metric).toEqual({ kind: "score" });
  });
  test("live goals ask for the expected score, and a pattern play replaces the accuracy", () => {
    expect(request({ goal: "skip", musicId: 100 }).metric).toEqual({ kind: "score" });
    const body = request({ goal: "free", musicId: 100, playMode: "pattern", missEvery: 10, greatPercent: 5 });
    expect(body.goal.play).toEqual({ kind: "pattern", greatFraction: 0.05, justFraction: 0, missEvery: 10 });
    expect(body.goal.accuracy).toBeUndefined();
    expect(body.metric).toEqual({ kind: "score" });
    for (const missEvery of [NaN, -1, 0.5]) expect(() => request({ goal: "free", musicId: 100, playMode: "pattern", missEvery })).toThrow();
  });
  test("event badges project the exact result grade in normal, challenge and skip scenes", () => {
    for (const venue of ["freeLive", "battleLive", "missionLive", "arenaLive", "challengeLive", "skip", "challengeSkip"] as const) {
      const challenge = venue === "challengeLive" || venue === "challengeSkip";
      const skipped = venue === "skip" || venue === "challengeSkip";
      const input = { ...defaultDeckGoalInput("eventItems"), venue, musicId: 100, challengeMusicId: 1, arenaMusicId: 42,
        boosts: 3, challengePoints: 800 as const };
      expect(goalGap(input, event)).toBeNull();
      const body = request(input);
      expect(body.metric).toEqual({ kind: "eventItems", eventId: 7, resourceType: 1, resourceId: 90, consumption: challenge ? 800 : 3 });
      expect(body.eventContext).toEqual({ rewardProjection: true, resultClock: skipped
        ? { kind: "skip", serverNowJstTicks: Number(jstTicks(now)) }
        : { kind: "played", liveStartJstTicks: null, serverNowJstTicks: Number(jstTicks(now)) } });
    }
  });
  test("EP and CP project each live with the same result-clock context", () => {
    for (const goal of ["eventPoints", "challengePoints"] as const) {
      for (const venue of ["freeLive", "skip"] as const) {
        const body = request({ goal, venue, musicId: 100, boosts: 3 });
        expect(body.metric).toEqual({ kind: goal, eventId: 7, consumption: 3 });
        expect(body.eventContext).toEqual({ rewardProjection: true, resultClock: venue === "skip"
          ? { kind: "skip", serverNowJstTicks: Number(jstTicks(now)) }
          : { kind: "played", liveStartJstTicks: null, serverNowJstTicks: Number(jstTicks(now)) } });
      }
    }
  });
  test("pattern capabilities prevent sending new play requests to an old engine", () => {
    const cap = { goals: ["freeLive"], metrics: { freeLive: ["score"] }, accuracy: { great: true, just: false } };
    const input = { goal: "free" as const, venue: "freeLive" as const, playMode: "pattern" as const };
    expect(computes(cap, input)).toBe(false);
    expect(computes(parseCapabilities(JSON.stringify({ ...cap, patternPlay: { required: ["missEvery"] } }))!, input)).toBe(true);
  });
});


test("unsupported accuracy is rejected without mutating the player's goal or declared rates", () => {
  const cap = { goals: ["battleLive", "freeLive"], metrics: { battleLive: ["score"], freeLive: ["score"] }, accuracy: { great: false, just: false } };
  const input = { ...defaultDeckGoalInput("battle"), musicId: 100, greatPercent: 5, justPercent: 90 };
  expect(computes(cap, input)).toBe(false);
  expect(input.greatPercent).toBe(5);
  expect(input.justPercent).toBe(90);
  expect(input.goal).toBe("battle");
  expect(computes(cap, { ...input, greatPercent: 0, justPercent: 100 })).toBe(true);
  expect(computes(cap, { ...input, goal: "free", greatPercent: 0 })).toBe(true);
});


describe("reward plan", () => {
  /** Roles in the listed order, every stated rate entered by hand. */
  const plan = (roles: [EventReward, RewardRole][], rates: Partial<Record<EventReward, number | null>> = {}): RewardPlan => {
    let value = defaultRewardPlan();
    for (const [kind, role] of roles) value = withRewardRole(value, kind, role);
    for (const [kind, rate] of Object.entries(rates)) value = withRewardRate(value, kind as EventReward, { auto: false, rate: rate ?? null });
    return value;
  };
  test("a new goal reward keeps the roles and tie-break order of the others and starts their rates over", () => {
    const before = plan([["challengePoints", "convert"], ["eventItems", "tieBreak"]], { challengePoints: 17.5 });
    const after = withMainReward(before, "eventItems");
    expect(after.roles).toEqual({ eventPoints: "off", challengePoints: "convert", eventItems: "off" });
    expect(after.tieOrder).toEqual([]);
    expect(after.rates).toEqual(defaultRewardPlan().rates);
    // Challenge points are rated by a challenge live again; event points were the goal and stay left out.
    expect(rewardLayout("eventItems", after, ["eventPoints", "challengePoints"])).toEqual({ base: "eventItems", converted: ["challengePoints"], ties: [], auto: true });
    expect(withMainReward(plan([["eventPoints", "tieBreak"], ["eventItems", "tieBreak"]]), "challengePoints").tieOrder).toEqual(["eventPoints", "eventItems"]);
  });

  const converted = (rates: Partial<Record<EventReward, number | null>>) => plan((Object.keys(rates) as EventReward[]).map(kind => [kind, "convert"]), rates);
  const others = ["challengePoints", "eventItems"] as const;
  const stated = (base: EventReward, rewards: RewardPlan, offered: readonly EventReward[] = others) => {
    const layout = rewardLayout(base, rewards, offered);
    return layout && statedTerms(layout, rewards);
  };
  const worth = { value: { numerator: "840000", denominator: "120" }, cost: 400 };
  const combinedMetric = { kind: "combined", field: "metric.levels", objective: "lexicographicWeightedExpectedSums", termMetrics: "metrics", weights: "integer",
    maxLevels: 4, maxTerms: 8, maxWeight: 1_000_000_000, consumption: "metric.consumption", lotteryFree: true };
  const eventItemRewards = { selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000 };
  const kinds = ["freeLive", "battleLive", "challengeLive", "skip"];
  const raw = { goals: kinds, metrics: Object.fromEntries(kinds.map(kind => [kind, kind === "challengeLive" ? ["eventPoints", "eventItems"] : ["eventPoints", "challengePoints", "eventItems"]])),
    accuracy: { great: true, just: true }, eventItemRewards };
  const items = { kind: "eventItems", eventId: 7, resourceType: 1, resourceId: 90 };

  test("a plan starts with every other reward left out and challenge points rated by a challenge live", () => {
    const start = defaultRewardPlan();
    expect(start.roles).toEqual({ eventPoints: "off", challengePoints: "off", eventItems: "off" });
    expect(start.rates.challengePoints).toEqual({ auto: true, rate: null });
    expect(rewardLayout("eventPoints", start, others)).toBeNull();
    expect(rewardLayoutOf(defaultDeckGoalInput("eventPoints"))).toBeNull();
    expect(usesChallengeRate(defaultDeckGoalInput("eventPoints"))).toBe(false);
  });

  test("stated rates become the smallest integer weights with the goal's reward first", () => {
    expect(stated("eventPoints", converted({ challengePoints: 17.5 }))).toEqual([{ kind: "eventPoints", weight: 2 }, { kind: "challengePoints", weight: 35 }]);
    expect(stated("eventPoints", converted({ eventItems: 0.25, challengePoints: 3 })))
      .toEqual([{ kind: "eventPoints", weight: 4 }, { kind: "challengePoints", weight: 12 }, { kind: "eventItems", weight: 1 }]);
    expect(stated("challengePoints", converted({ eventPoints: 0.0571 }), ["eventPoints", "eventItems"]))
      .toEqual([{ kind: "challengePoints", weight: 10000 }, { kind: "eventPoints", weight: 571 }]);
    // Four decimals at most, fewer while a weight would pass the solver's limit.
    expect(stated("eventPoints", converted({ challengePoints: 0.12345 }))).toEqual([{ kind: "eventPoints", weight: 2000 }, { kind: "challengePoints", weight: 247 }]);
    expect(stated("eventPoints", converted({ challengePoints: 1234.5678 }))).toEqual([{ kind: "eventPoints", weight: 5000 }, { kind: "challengePoints", weight: 6172839 }]);
    expect(stated("eventPoints", converted({ challengePoints: 1_000_000 }))).toEqual([{ kind: "eventPoints", weight: 1 }, { kind: "challengePoints", weight: 1_000_000 }]);
    expect(stated("eventPoints", converted({ challengePoints: 1_000_000_000 }))).toEqual([{ kind: "eventPoints", weight: 1 }, { kind: "challengePoints", weight: 1_000_000_000 }]);
  });

  test("an unusable stated rate leaves the plan without terms", () => {
    for (const rate of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.00004, 1_000_000_001]) expect(stated("eventPoints", converted({ challengePoints: rate }))).toBeNull();
    expect(stated("eventPoints", converted({ challengePoints: 2, eventItems: null }))).toBeNull();
    // The goal's own reward and a reward the venue does not offer are not part of the plan.
    expect(stated("eventPoints", converted({ eventPoints: 9, challengePoints: 2 }))).toEqual([{ kind: "eventPoints", weight: 1 }, { kind: "challengePoints", weight: 2 }]);
    expect(rewardLayout("eventPoints", converted({ challengePoints: 2 }), ["eventItems"])).toBeNull();
  });

  test("tie-break rewards keep the order they were chosen in and can be moved to the front", () => {
    const both = plan([["eventPoints", "tieBreak"], ["eventItems", "tieBreak"]]);
    expect(both.tieOrder).toEqual(["eventPoints", "eventItems"]);
    expect(rewardLayout("challengePoints", both, ["eventPoints", "eventItems"])).toEqual({ base: "challengePoints", converted: [], ties: ["eventPoints", "eventItems"], auto: false });
    const swapped = withFirstTieBreak(both, "eventItems");
    expect(swapped.tieOrder).toEqual(["eventItems", "eventPoints"]);
    expect(withFirstTieBreak(both, "challengePoints")).toBe(both);
    expect(withRewardRole(swapped, "eventItems", "off").tieOrder).toEqual(["eventPoints"]);
    expect(withRewardRole(swapped, "eventPoints", "tieBreak").tieOrder).toEqual(["eventItems", "eventPoints"]);
    expect(rewardLevels(rewardLayout("challengePoints", swapped, ["eventPoints", "eventItems"])!, swapped, null))
      .toEqual([[{ kind: "challengePoints", weight: 1 }], [{ kind: "eventItems", weight: 1 }], [{ kind: "eventPoints", weight: 1 }]]);
  });

  test("a challenge live rates challenge points exactly, in the unit of the stated terms", () => {
    const auto = plan([["challengePoints", "convert"], ["eventItems", "tieBreak"]]);
    const layout = rewardLayout("eventPoints", auto, others)!;
    expect(layout).toEqual({ base: "eventPoints", converted: ["challengePoints"], ties: ["eventItems"], auto: true });
    expect(statedTerms(layout, auto)).toEqual([{ kind: "eventPoints", weight: 1 }]);
    expect(rewardLevels(layout, auto, null)).toBeNull();
    // 7,000 PT for 400 CP: one challenge point counts as 17.5 PT.
    expect(rewardLevels(layout, auto, worth)).toEqual([[{ kind: "eventPoints", weight: 2 }, { kind: "challengePoints", weight: 35 }], [{ kind: "eventItems", weight: 1 }]]);
    // With badges stated at 40 PT each, the challenge live's value and the weights share that unit.
    const withBadges = withRewardRate(plan([["challengePoints", "convert"], ["eventItems", "convert"]]), "eventItems", { rate: 40 });
    expect(rewardLevels(rewardLayout("eventPoints", withBadges, others)!, withBadges, worth))
      .toEqual([[{ kind: "eventPoints", weight: 2 }, { kind: "challengePoints", weight: 35 }, { kind: "eventItems", weight: 80 }]]);
    // A challenge live that earns nothing leaves challenge points out.
    expect(rewardLevels(layout, auto, { value: { numerator: "0", denominator: "120" }, cost: 400 })).toEqual([[{ kind: "eventPoints", weight: 1 }], [{ kind: "eventItems", weight: 1 }]]);
    for (const cost of [0, 1.5]) expect(rewardLevels(layout, auto, { ...worth, cost })).toBeNull();
    const wide = rewardLevels(layout, auto, { value: { numerator: "123456789012345678901", denominator: "7" }, cost: 1600 })!;
    expect(wide[0]).toEqual([{ kind: "eventPoints", weight: 1 }, { kind: "challengePoints", weight: 1_000_000_000 }]);
    // A stated rate for challenge points reads no challenge live, and a challenge-point goal has none to read.
    expect(rewardLayout("eventPoints", converted({ challengePoints: 2 }), others)!.auto).toBe(false);
    expect(rewardLayout("challengePoints", plan([["eventPoints", "convert"]]), ["eventPoints", "eventItems"])!.auto).toBe(false);
  });

  test("shares split a team's total by reward in the goal's own unit", () => {
    const shares = rewardShares([{ kind: "eventPoints", weight: 2 }, { kind: "challengePoints", weight: 35 }], [1000, 40]);
    expect(shares.map(share => [share.kind, share.rate, share.value, share.counted])).toEqual([["eventPoints", 1, 1000, 1000], ["challengePoints", 17.5, 40, 700]]);
    expect(shares[0]!.share + shares[1]!.share).toBeCloseTo(1);
    expect(shares[1]!.share).toBeCloseTo(700 / 1700);
    expect(rewardShares([{ kind: "eventPoints", weight: 1 }, { kind: "eventItems", weight: 3 }], [0, 0]).map(share => share.share)).toEqual([0, 0]);
  });

  test("a planned goal sends one combined metric with the shared consumption and every term's own fields", () => {
    const input = { ...defaultDeckGoalInput("eventPoints"), musicId: 100, boosts: 3, rewards: converted({ challengePoints: 17.5, eventItems: 40 }) };
    const body = request(input);
    expect(body.metric).toEqual({ kind: "combined", consumption: 3, levels: [[
      { kind: "eventPoints", eventId: 7, weight: 2 }, { kind: "challengePoints", eventId: 7, weight: 35 }, { ...items, weight: 80 }]] });
    expect(body.eventContext.rewardProjection).toBe(true);
    expect(body.aggregation).toBeUndefined();
    expect(body.k).toBe(5);
    for (const [first, second] of [["eventPoints", "eventItems"], ["eventItems", "eventPoints"]] as const) {
      const ties = request({ goal: "challengePoints", musicId: 100, rewards: plan([[first, "tieBreak"], [second, "tieBreak"]]) });
      const term = (kind: EventReward) => kind === "eventItems" ? { ...items, weight: 1 } : { kind, eventId: 7, weight: 1 };
      expect(ties.metric).toEqual({ kind: "combined", consumption: 0, levels: [[{ kind: "challengePoints", eventId: 7, weight: 1 }], [term(first)], [term(second)]] });
    }
    // Goals without an event payoff, and a plan that leaves every reward out, keep their one metric.
    expect(request({ goal: "free", musicId: 100, rewards: converted({ challengePoints: 2 }) }).metric).toEqual({ kind: "score" });
    expect(request({ goal: "eventPoints", musicId: 100 }).metric).toEqual({ kind: "eventPoints", eventId: 7, consumption: 0 });
    expect(request({ goal: "challengePoints", musicId: 100, boosts: 3 }, { ...event, itemId: null }).metric).toEqual({ kind: "challengePoints", eventId: 7, consumption: 3 });
    expect(request({ goal: "eventItems", musicId: 100 }).metric).toEqual({ ...items, consumption: 0 });
  });

  test("a challenge live counts badges but no challenge points, and spends the chosen cost", () => {
    const input = { ...defaultDeckGoalInput("eventPoints"), venue: "challengeLive" as const, challengeMusicId: 1, challengePoints: 400 as const,
      rewards: converted({ challengePoints: 17.5, eventItems: 2 }) };
    expect(mixableRewards(input)).toEqual(["eventItems"]);
    expect(request(input).metric).toEqual({ kind: "combined", consumption: 400, levels: [[{ kind: "eventPoints", eventId: 7, weight: 1 }, { ...items, weight: 2 }]] });
    expect(rewardLayoutOf({ ...input, rewards: converted({ challengePoints: 17.5 }) })).toBeNull();
    expect(request({ ...input, rewards: converted({ challengePoints: 17.5 }) }).metric).toEqual({ kind: "eventPoints", eventId: 7, consumption: 400 });
  });

  test("a rated goal asks the challenge live first and builds its own request from the answer", () => {
    const input = { ...defaultDeckGoalInput("eventPoints"), musicId: 100, boosts: 3, challengeMusicId: 2, rateDifficulty: "hard" as const, challengePoints: 800 as const,
      greatPercent: 4, rewards: plan([["challengePoints", "convert"], ["eventItems", "tieBreak"]]) };
    const context = { event, now, constraints: { includeMembers: ["61"], excludeMembers: ["62"], excludeSnaps: ["70"] } };
    expect(usesChallengeRate(input)).toBe(true);
    const rate = JSON.parse(challengeRateRequest(input, context)!);
    expect(rate.goal).toEqual({ kind: "challengeLive", challengeMusicId: 2, difficulty: "hard", accuracy: { greatFraction: 0.04 } });
    expect(rate.metric).toEqual({ kind: "combined", consumption: 800, levels: [[{ kind: "eventPoints", eventId: 7, weight: 1 }], [{ ...items, weight: 1 }]] });
    expect(rate.k).toBe(1);
    expect(rate.constraints).toEqual({ leader: null, includeMembers: [61], excludeMembers: [62], excludeSnaps: [70], noSnaps: false });
    expect(rate.limits).toEqual({ timeLimitMs: 60000 });
    const own = JSON.parse(recommendationRequest(input, context, { worth }));
    expect(own.goal).toEqual({ kind: "freeLive", musicId: 100, difficulty: "expert", accuracy: { greatFraction: 0.04 } });
    expect(own.metric).toEqual({ kind: "combined", consumption: 3, levels: [
      [{ kind: "eventPoints", eventId: 7, weight: 2 }, { kind: "challengePoints", eventId: 7, weight: 35 }], [{ ...items, weight: 1 }]] });
    expect(own.k).toBe(5);
    expect(() => recommendationRequest(input, context)).toThrow("worth of a challenge point");
    // Without another reward the challenge live is asked for the goal's reward alone.
    const alone = JSON.parse(challengeRateRequest({ ...input, rewards: plan([["challengePoints", "convert"]]) }, context)!);
    expect(alone.metric).toEqual({ kind: "eventPoints", eventId: 7, consumption: 800 });
    const badges = JSON.parse(challengeRateRequest({ ...input, goal: "eventItems", rewards: plan([["challengePoints", "convert"]]) }, context)!);
    expect(badges.metric).toEqual({ ...items, consumption: 800 });
    expect(challengeRateRequest({ ...input, rewards: converted({ challengePoints: 17.5 }) }, context)).toBeNull();
    expect(challengeRateRequest({ ...input, venue: "challengeLive" }, context)).toBeNull();
    expect(challengeRateRequest(defaultDeckGoalInput("free"), context)).toBeNull();
  });

  test("an incomplete plan names what it still needs", () => {
    const input = { ...defaultDeckGoalInput("eventPoints"), musicId: 100 };
    expect(goalGap({ ...input, rewards: plan([["eventItems", "convert"]]) }, event)).toBe("rewardMix");
    expect(() => request({ ...input, rewards: plan([["eventItems", "convert"]]) })).toThrow("rewardMix");
    expect(goalGap({ ...input, rewards: converted({ challengePoints: 2 }), aggregation: "maximum" }, event)).toBe("rewardMix");
    expect(goalGap({ ...input, rewards: plan([["eventItems", "tieBreak"]]), aggregation: "maximum" }, event)).toBe("rewardMix");
    expect(goalGap({ ...input, rewards: plan([["challengePoints", "convert"]]) }, event)).toBe("rateSong");
    expect(goalGap({ ...input, rewards: plan([["challengePoints", "convert"]]), challengeMusicId: 9 }, event)).toBe("rateSong");
    expect(goalGap({ ...input, rewards: plan([["challengePoints", "convert"]]), challengeMusicId: 2 }, event)).toBeNull();
    expect(goalGap({ ...input, rewards: converted({ challengePoints: 2 }) }, event)).toBeNull();
    expect(usesEventItemRewards({ ...input, rewards: converted({ eventItems: 2 }) })).toBe(true);
    expect(usesEventItemRewards({ ...input, rewards: plan([["eventItems", "tieBreak"]]) })).toBe(true);
    expect(usesEventItemRewards({ ...input, rewards: converted({ challengePoints: 2 }) })).toBe(false);
    expect(goalGap({ ...input, rewards: plan([["eventItems", "tieBreak"]]) }, { ...event, itemId: null })).toBe("eventItem");
    expect(goalGap({ ...input, rewards: converted({ challengePoints: 2 }) }, { ...event, itemId: null })).toBeNull();
  });

  test("the engine must declare levelled combined metrics and compute every reward in the scene", () => {
    const capable = parseCapabilities(JSON.stringify({ ...raw, combinedMetric }))!;
    expect(capable.combinedMetric).toEqual({ maxLevels: 4, maxTerms: 8, maxWeight: 1_000_000_000 });
    const input = { goal: "eventPoints" as const, venue: "freeLive" as const, rewards: converted({ challengePoints: 17.5 }) };
    expect(computes(capable, input)).toBe(true);
    expect(computes(capable, { ...input, rewards: defaultRewardPlan() })).toBe(true);
    expect(computes(capable, { ...input, aggregation: "maximum" })).toBe(false);
    expect(computes(parseCapabilities(JSON.stringify(raw))!, input)).toBe(false);
    expect(computes(parseCapabilities(JSON.stringify(raw))!, { ...input, rewards: defaultRewardPlan() })).toBe(true);
    for (const patch of [{ objective: "weightedExpectedSum" }, { weights: "decimal" }, { kind: "sum" }, { maxTerms: "8" }, { maxWeight: null }, { maxLevels: undefined }]) {
      expect(parseCapabilities(JSON.stringify({ ...raw, combinedMetric: { ...combinedMetric, ...patch } }))!.combinedMetric).toBeUndefined();
    }
    const limited = (patch: object) => parseCapabilities(JSON.stringify({ ...raw, combinedMetric: { ...combinedMetric, ...patch } }))!;
    expect(computes(limited({ maxTerms: 1 }), input)).toBe(false);
    expect(computes(limited({ maxWeight: 1_000_000 }), input)).toBe(false);
    const ties = { goal: "challengePoints" as const, venue: "freeLive" as const, rewards: plan([["eventPoints", "tieBreak"], ["eventItems", "tieBreak"]]) };
    expect(computes(capable, ties)).toBe(true);
    expect(computes(limited({ maxLevels: 2 }), ties)).toBe(false);
    const noChallengePoints = parseCapabilities(JSON.stringify({ ...raw, combinedMetric, metrics: { ...raw.metrics, freeLive: ["eventPoints", "eventItems"] } }))!;
    expect(computes(noChallengePoints, input)).toBe(false);
    expect(computes(noChallengePoints, { ...input, rewards: converted({ eventItems: 2 }) })).toBe(true);
    const noBadges = parseCapabilities(JSON.stringify({ ...raw, combinedMetric, eventItemRewards: undefined }))!;
    expect(computes(noBadges, { ...input, rewards: converted({ eventItems: 2 }) })).toBe(false);
    expect(computes(noBadges, input)).toBe(true);
    // Challenge points rated by a challenge live need that live and its rewards computed too.
    const rated = { ...input, rewards: plan([["challengePoints", "convert"], ["eventItems", "tieBreak"]]) };
    expect(computes(capable, rated)).toBe(true);
    expect(computes(parseCapabilities(JSON.stringify({ ...raw, combinedMetric, goals: kinds.filter(kind => kind !== "challengeLive") }))!, rated)).toBe(false);
    expect(computes(parseCapabilities(JSON.stringify({ ...raw, combinedMetric, metrics: { ...raw.metrics, challengeLive: ["eventPoints"] } }))!, rated)).toBe(false);
  });
});

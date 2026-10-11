import { describe, expect, test } from "bun:test";
import { DECK_GOALS, PEAK_VENUES, computes, computesGoal, defaultDeckGoalInput, goalAggregation, goalGap, goalVenues, heldEvent, jstTicks, parseCapabilities,
  recommendationRequest, type DeckEvent, type DeckGoalInput } from "../src/lib/deck/goals";
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
  test("the theoretical maximum asks for the highest score at its venue, otherwise the same request as that live's score goal", () => {
    const scoreGoal = { freeLive: "free", challengeLive: "challenge" } as const;
    const context = { event, now, constraints: { includeMembers: ["61"], excludeMembers: ["62"], excludeSnaps: ["70"] } };
    for (const venue of PEAK_VENUES) {
      const input = { ...defaultDeckGoalInput("peak"), venue, musicId: 245, arenaMusicId: 42, challengeMusicId: 1,
        playMode: "pattern" as const, missEvery: 17, greatPercent: 7, justPercent: 81 };
      const body = JSON.parse(recommendationRequest(input, context));
      expect(body.aggregation).toBe("maximum");
      expect(body.goal.kind).toBe(venue);
      expect(body.metric).toEqual({ kind: "score" });
      expect(body.goal.play).toEqual({ kind: "pattern", greatFraction: 0.07, justFraction: 0, missEvery: 17 });
      const { aggregation: _, ...rest } = body;
      expect(rest).toEqual(JSON.parse(recommendationRequest({ ...input, goal: scoreGoal[venue as keyof typeof scoreGoal] }, context)));
    }
  });
  test("every other goal ranks by the average and sends no aggregation", () => {
    expect(goalAggregation("peak")).toBe("maximum");
    for (const goal of DECK_GOALS.filter(goal => goal !== "peak")) {
      expect(goalAggregation(goal)).toBe("expected");
      expect(request({ goal, musicId: 245, arenaMusicId: 42, challengeMusicId: 1 }).aggregation).toBeUndefined();
    }
  });
  test("the theoretical maximum plays only Free and Challenge Live, and its Challenge Live needs the held event", () => {
    expect(goalVenues("peak")).toEqual(["freeLive", "challengeLive"]);
    // In Gekisou modes one root seed draws the skill order, LUCK and probability skills together: no reachable maximum is computed.
    for (const venue of ["battleLive", "missionLive", "arenaLive", "skip", "challengeSkip"] as const) {
      expect(() => request({ goal: "peak", venue, musicId: 245, challengeMusicId: 1 })).toThrow();
    }
    expect(goalGap({ ...defaultDeckGoalInput("peak"), venue: "challengeLive", challengeMusicId: 1 }, null)).toBe("event");
    expect(goalGap({ ...defaultDeckGoalInput("peak"), venue: "challengeLive" }, event)).toBe("challengeSong");
    expect(goalGap({ ...defaultDeckGoalInput("peak"), venue: "freeLive", musicId: 245 }, null)).toBeNull();
    expect(request({ goal: "peak", venue: "challengeLive", challengeMusicId: 1 }).eventIds).toEqual([7]);
    expect(request({ goal: "peak", venue: "freeLive", musicId: 245 }).eventIds).toEqual([]);
  });
  test("the theoretical maximum is computed only at venues where the engine declares the maximum", () => {
    const scores = { battleLive: ["score"], missionLive: ["score"], arenaLive: ["score"], freeLive: ["score"], challengeLive: ["score"] };
    const mean = { goals: Object.keys(scores), metrics: scores, accuracy: { great: true, just: true } };
    expect(computesGoal(mean, "peak")).toBe(false);
    expect(computesGoal(mean, "free")).toBe(true);
    const ordinary = { ...mean, aggregations: { maximum: { freeLive: ["score"], challengeLive: ["score"] } } };
    expect(computesGoal(ordinary, "peak")).toBe(true);
    expect(computes(ordinary, { goal: "peak", venue: "freeLive" })).toBe(true);
    expect(computes(ordinary, { goal: "peak", venue: "battleLive" })).toBe(false);
    // An engine declaring a Gekisou maximum does not open the goal in Gekisou modes.
    const luck = { ...mean, aggregations: { maximum: { battleLive: ["score"], missionLive: ["score"], arenaLive: ["score"] } } };
    expect(computesGoal(luck, "peak")).toBe(false);
    for (const venue of ["battleLive", "missionLive", "arenaLive"] as const) expect(computes(luck, { goal: "peak", venue })).toBe(false);
    expect(computes(luck, { goal: "battle", venue: "freeLive" })).toBe(true);
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
  test("event items require the complete exact-grade capability for every scene", () => {
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
        expect(computes(cap, { goal: "eventItems", venue })).toBe(accepted);
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
  test("the theoretical maximum requires the declared venue and keeps play restrictions", () => {
    const legacy = { goals: ["freeLive", "battleLive"], metrics: { freeLive: ["score", "eventPoints"], battleLive: ["score"] }, accuracy: { great: false, just: false } };
    const input = { ...defaultDeckGoalInput("peak"), venue: "freeLive" as const, musicId: 100 };
    expect(computes(parseCapabilities(JSON.stringify(legacy))!, input)).toBe(false);
    const cap = parseCapabilities(JSON.stringify({ ...legacy, aggregations: { maximum: { freeLive: ["score"] } } }))!;
    expect(computes(cap, input)).toBe(true);
    expect(computes(cap, { ...input, venue: "battleLive" })).toBe(false);
    expect(computes(cap, { ...input, greatPercent: 5 })).toBe(false);
    expect(computes(cap, { ...input, playMode: "pattern" })).toBe(false);
    expect(computes(cap, { ...input, goal: "eventPoints" })).toBe(true);
    expect(computes(cap, { ...input, goal: "battle" })).toBe(true);
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


describe("challenge-point secondary priorities", () => {
  const priorities = ["eventPointsFirst", "eventItemsFirst"] as const;
  const eventItemRewards = { selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000 };
  const challengePointPriorities = { priorities, objective: "lexicographicExpected", primary: "challengePoints", bestPrimaryOnly: true, lotteryFree: true };
  const kinds = ["freeLive", "battleLive", "missionLive", "arenaLive", "skip"];
  const raw = { goals: kinds, metrics: Object.fromEntries(kinds.map(kind => [kind, ["challengePoints"]])), accuracy: { great: true, just: true }, eventItemRewards };
  test("CP-only requests retain their metric and need no badge resource", () => {
    expect(defaultDeckGoalInput("challengePoints").secondaryPriority).toBeNull();
    expect(request({ goal: "challengePoints", musicId: 100, boosts: 3 }, { ...event, itemId: null }).metric)
      .toEqual({ kind: "challengePoints", eventId: 7, consumption: 3 });
    for (const secondaryPriority of priorities) {
      expect(request({ goal: "eventPoints", musicId: 100, secondaryPriority }).metric)
        .toEqual({ kind: "eventPoints", eventId: 7, consumption: 0 });
    }
  });
  test("both priorities carry the resource and keep reward projection across ordinary venues", () => {
    for (const secondaryPriority of priorities) for (const venue of ["freeLive", "battleLive", "missionLive", "arenaLive", "skip"] as const) {
      const input = { ...defaultDeckGoalInput("challengePoints"), secondaryPriority, venue, musicId: 100, arenaMusicId: 42, boosts: 3 };
      const body = request(input);
      expect(body.metric).toEqual({ kind: "challengePoints", eventId: 7, consumption: 3, secondaryPriority, resourceType: 1, resourceId: 90 });
      expect(body.eventContext.rewardProjection).toBe(true);
      expect(Object.keys(body.eventContext).sort()).toEqual(["resultClock", "rewardProjection"]);
      expect(body.aggregation).toBeUndefined();
      expect(body.k).toBe(5);
      expect(goalGap(input, event)).toBeNull();
      expect(goalGap(input, { ...event, itemId: null })).toBe("eventItem");
      expect(() => request(input, { ...event, itemId: null })).toThrow();
    }
  });
  test("challenge venues are rejected with either priority", () => {
    for (const secondaryPriority of priorities) {
      const input = { ...defaultDeckGoalInput("challengePoints"), musicId: 100, secondaryPriority };
      for (const venue of ["challengeLive", "challengeSkip"] as const) expect(() => request({ ...input, venue, challengeMusicId: 1 })).toThrow();
    }
  });
  test("both complete capability contracts are required, while plain CP remains available", () => {
    const valid = parseCapabilities(JSON.stringify({ ...raw, challengePointPriorities }))!;
    for (const secondaryPriority of priorities) for (const venue of ["freeLive", "battleLive", "missionLive", "arenaLive", "skip"] as const) {
      expect(computes(valid, { goal: "challengePoints", venue, secondaryPriority })).toBe(true);
    }
    const variants: unknown[] = [undefined, null, {}, { ...challengePointPriorities, priorities: ["eventPointsFirst"] },
      { ...challengePointPriorities, priorities: ["eventPointsFirst", "eventPointsFirst"] },
      { ...challengePointPriorities, objective: "weightedSum" }, { ...challengePointPriorities, primary: "eventPoints" },
      { ...challengePointPriorities, bestPrimaryOnly: false }, { ...challengePointPriorities, lotteryFree: false }];
    for (const challengePointPriorities of variants) {
      const cap = parseCapabilities(JSON.stringify({ ...raw, challengePointPriorities }))!;
      expect(computesGoal(cap, "challengePoints")).toBe(true);
      for (const secondaryPriority of priorities) expect(computes(cap, { goal: "challengePoints", venue: "freeLive", secondaryPriority })).toBe(false);
    }
    for (const rewards of [undefined, { ...eventItemRewards, probabilityMarker: 9999 }]) {
      const cap = parseCapabilities(JSON.stringify({ ...raw, eventItemRewards: rewards, challengePointPriorities }))!;
      expect(computes(cap, { goal: "challengePoints", venue: "freeLive" })).toBe(true);
      expect(computes(cap, { goal: "challengePoints", venue: "freeLive", secondaryPriority: "eventPointsFirst" })).toBe(false);
    }
  });
});

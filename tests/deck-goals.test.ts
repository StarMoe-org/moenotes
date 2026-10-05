import { describe, expect, test } from "bun:test";
import { computes, computesGoal, defaultDeckGoalInput, goalGap, heldEvent, jstTicks, parseCapabilities, recommendationRequest, type DeckEvent, type DeckGoalInput } from "../src/lib/deck/goals";
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
  test("a battle live sends Great and Just, rank 1 and the score metric", () => {
    const body = request({ goal: "battle", musicId: 245, difficulty: "expert", greatPercent: 3, justPercent: 95 });
    expect(body.format).toBe("ournotes-deck.recommendation-request/2");
    expect(body.goal).toEqual({ kind: "battleLive", musicId: 245, difficulty: "expert", rank: 1, accuracy: { greatFraction: 0.03, justFraction: 0.95 } });
    expect(body.metric).toEqual({ kind: "score" });
    expect(body.eventIds).toEqual([7]);
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
  test("event points carry the event, the consumption and the result clock", () => {
    const body = request({ goal: "eventPoints", venue: "freeLive", musicId: 245, boosts: 3 });
    expect(body.metric).toEqual({ kind: "eventPoints", eventId: 7, consumption: 3 });
    expect(body.eventContext.resultClock.kind).toBe("played");
    expect(body.eventContext.rewardProjection).toBe(true);
    expect(body.room).toBeUndefined();
    const challenge = request({ goal: "eventItems", venue: "challengeLive", challengeMusicId: 1, challengePoints: 800, rewardContextConfirmed: true, localEventPoints: 17, localChallengePoints: 800 });
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
  test("an engine without capabilities reports none", () => {
    expect(parseCapabilities(null)).toBeNull();
    expect(parseCapabilities("not json")).toBeNull();
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
  test("conditional rewards need an explicit verified route and entered balances", () => {
    const withReward = { ...event, rewards: [{ id: 12, amount: 10, challenge: true }, { id: 13, amount: 10, challenge: false }] };
    const patch: Partial<DeckGoalInput> = { goal: "eventItems", venue: "challengeSkip", challengeMusicId: 1,
      selectedRewards: [12], rewardContextConfirmed: true, localEventPoints: 100, localChallengePoints: 800 };
    const body = request(patch, withReward);
    expect(body.eventContext.localEvents).toEqual([{ eventId: 7, points: 100, challengePoints: 800, added: [] }]);
    expect(body.eventContext.selectedRewards).toEqual([{ eventId: 7, rewardId: 12 }]);
    expect(body.eventContext.rewardProjection).toBeUndefined();
    expect(() => request({ ...patch, selectedRewards: [13] }, withReward)).toThrow();
    expect(() => request({ ...patch, rewardContextConfirmed: false }, withReward)).toThrow();
    expect(() => request({ ...patch, localEventPoints: null }, withReward)).toThrow();
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

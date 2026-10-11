import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckGoalConditions from "../src/components/deck/DeckGoalConditions";
import DeckPeakNote from "../src/components/deck/DeckPeakNote";
import DeckResult from "../src/components/deck/DeckResult";
import DeckWorkspace from "../src/components/deck/DeckWorkspace";
import { DECK_GOALS, defaultDeckGoalInput, parseCapabilities, type DeckGoalInput, type DeckSolverCapabilities } from "../src/lib/deck/goals";
import { parseDeckAnswer } from "../src/lib/deck/answer";
import { t } from "../src/i18n";

test("event deadlines render in server time before hydration regardless of the host timezone", () => {
  const originalZone = process.env.TZ;
  try {
    for (const offset of ["+08:00", "+09:00"]) {
      const render = () => renderToStaticMarkup(<DeckWorkspace locale="en-US" page="deck" servers={["tw"]} members={[]} snaps={[]} songs={[]}
        deckEvents={[{ server: "tw", events: [{ id: 1, name: "Synthetic event", startAt: `2000/01/01 00:00:00${offset}`,
          endAt: `2099/02/03 12:59:59${offset}`, itemId: null, challengeMusics: [] }] }]} />);
      process.env.TZ = "UTC";
      const expected = render();
      expect(expected).toContain(`02/03/2099, 12:59 UTC+${offset === "+08:00" ? 8 : 9}`);
      for (const zone of ["Asia/Singapore", "Europe/London", "America/Los_Angeles"]) {
        process.env.TZ = zone;
        expect(render()).toBe(expected);
      }
    }
  } finally {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  }
});

test("a live goal offers the accuracy and pattern plays", () => {
  const html = renderToStaticMarkup(<DeckGoalConditions locale="en-US" input={{ ...defaultDeckGoalInput("free"), playMode: "pattern", missEvery: 10 }}
    capabilities={{ goals: ["freeLive"], metrics: { freeLive: ["score"] }, accuracy: { great: true, just: false }, patternPlay: true }} onChange={() => {}} />);
  expect(html).toContain('value="pattern" selected=""');
  expect(html).toContain('value="10"');
  expect(html).not.toContain("Minimum life at the end");
});

test("the theoretical maximum is its own goal next to the score goals", () => {
  const html = renderToStaticMarkup(<DeckWorkspace locale="en-US" page="deck" servers={["tw"]} members={[]} snaps={[]} songs={[]} />);
  expect(html).toContain("Theoretical maximum");
  expect(html).toContain("in Free or Challenge Live");
  expect(html).not.toContain("LUCK draw");
  expect(html.indexOf("Free Live high score")).toBeLessThan(html.indexOf("Theoretical maximum"));
  expect(html).not.toContain('type="radio"');
});

test("every goal card has its title, note and coming-soon badges in each core locale", () => {
  const keys = [...DECK_GOALS.flatMap(goal => [`goals.${goal}`, `goalNotes.${goal}`]), "comingSoon", "objective.unsupported", "solver.eventItemsUnsupported"];
  for (const locale of ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const)
    for (const key of keys) expect([key, t(locale, `deckWorkspace.${key}`)]).not.toEqual([key, ""]);
});

test("the theoretical maximum explains why Gekisou modes are not offered and flags venues the engine cannot compute yet", () => {
  const render = (input: DeckGoalInput, capabilities: DeckSolverCapabilities | null) => renderToStaticMarkup(
    <DeckPeakNote locale="en-US" input={input} capabilities={capabilities} />);
  const cap = { goals: ["freeLive", "challengeLive"], metrics: { freeLive: ["score"], challengeLive: ["score"] },
    accuracy: { great: true, just: true }, aggregations: { maximum: { freeLive: ["score"] } } };
  const free = render({ ...defaultDeckGoalInput("peak"), venue: "freeLive" }, cap);
  expect(free).toContain("best of the 120 skill orders");
  expect(free).toContain("Gekisou modes have no theoretical maximum");
  expect(free).toContain("simulating every seed");
  expect(free).not.toContain("cannot compute");
  expect(render({ ...defaultDeckGoalInput("peak"), venue: "challengeLive" }, cap)).toContain("cannot compute the theoretical maximum here yet");
  // Before the engine loads, or with an engine that computes no maximum at all, the goal's own blocker explains it.
  expect(render({ ...defaultDeckGoalInput("peak"), venue: "challengeLive" }, null)).not.toContain("cannot compute");
  expect(render({ ...defaultDeckGoalInput("peak"), venue: "challengeLive" }, { ...cap, aggregations: {} })).not.toContain("cannot compute");
  expect(render(defaultDeckGoalInput("free"), cap)).toBe("");
});

test("maximum results retain their own metric, objective, proof state and best order after inputs change", () => {
  const answer = (kind: string) => parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: {
    goal: { kind }, metric: { kind: "score" }, aggregation: "maximum", phase: "done", elapsedMs: 10,
    optimality: { proven: false, lowerBound: 900000, upperBound: 990000 }, teams: [{ rank: 1, rankCertified: false,
      leader: { member: 3, snap: null }, others: [1, 2, 4, 5].map(member => ({ member, snap: null })), power: 100,
      value: { score: 987654 }, orders: null,
      bestOrder: { score: 987654, order: [5, 4, 3, 2, 1] },
      layout: { members: [1, 2, 3, 4, 5], snaps: [null, null, null, null, null] } }] } }));
  const noop = () => {};
  const render = (kind: string) => renderToStaticMarkup(<DeckResult locale="en-US" goal="free" stale timeLimit={60} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
    job={{ status: "done", key: "maximum", answer: answer(kind), stopped: false }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
  const html = render("freeLive");
  expect(html).toContain("Theoretical maximum score");
  expect(html).toContain("987,654");
  expect(html).toContain("among the 120 skill orders");
  expect(html).toContain("previous result");
  expect(html).toContain("not proven");
  expect(html).toContain("Skill order for the theoretical maximum");
  expect(html).toContain("5 → 4 → 3 → 2 → 1");
  expect(html).not.toContain("Expected score");
  expect(html).not.toContain("performance orders");
});

test("unproven results distinguish engine time limits, refinement stops and legacy answers", () => {
  const noop = () => {};
  for (const exitReason of ["refinementRequired", "timeLimit", undefined]) {
    const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: {
      goal: { kind: "freeLive" }, metric: { kind: "score" }, aggregation: "maximum", phase: "done", elapsedMs: 10,
      exitReason, optimality: { proven: false }, teams: [] } }));
    const render = (stopped: boolean) => renderToStaticMarkup(<DeckResult locale="en-US" goal="free" stale timeLimit={60} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
      job={{ status: "done", key: "maximum", answer, stopped }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
    const html = render(false);
    expect(html.includes("Time limit reached")).toBe(exitReason === "timeLimit");
    expect(html).toContain("not proven");
    expect(html).toContain("Theoretical maximum");
    expect(html).toContain("previous result");
    const stopped = render(true);
    expect(stopped).toContain("Stopped · best so far");
    expect(stopped).not.toContain("Time limit reached");
  }
});

test("a stale goal selection cannot relabel a finished result, and its proof label links the guide", () => {
  const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", missing: [], errors: [], result: {
    goal: { kind: "freeLive", play: { kind: "pattern", judged: 100, misses: 10 } }, metric: { kind: "score" }, phase: "done", elapsedMs: 10,
    optimality: { proven: true }, account: { cards: { coversAllOwnedCards: true } }, teams: [{ rank: 1, rankCertified: true,
      leader: { member: 3, snap: null }, others: [1, 2, 4, 5].map(member => ({ member, snap: null })), power: 100,
      value: { score: 999999, exact: null, interval: null, payoff: null }, orders: null,
      layout: { members: [1, 2, 3, 4, 5], snaps: [null, null, null, null, null] } }] } }));
  const noop = () => {};
  const html = renderToStaticMarkup(<DeckResult locale="en-US" goal="power" stale timeLimit={null} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
    job={{ status: "done", key: "old", answer, stopped: false }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
  expect(html).toContain("Expected score");
  expect(html).toContain("999,999");
  expect(html).toContain("100 judged notes · 10 Misses");
  expect(html).toContain('href="/en/tools/deck/guide#proven"');
});


test("event badge conditions show exact-grade projection and only scene-relevant inputs", () => {
  for (const venue of ["freeLive", "challengeLive", "skip", "challengeSkip"] as const) {
    const html = renderToStaticMarkup(<DeckGoalConditions locale="en-US" input={{ ...defaultDeckGoalInput("eventItems"), venue }}
      capabilities={null} onChange={() => {}} />);
    expect(html).toContain("single matching result grade");
    expect(html).toContain("Time limit");
    expect((html.match(/<select/g) ?? []).length).toBe(venue === "skip" || venue === "challengeSkip" ? 1 : 2);
    expect((html.match(/<input/g) ?? []).length).toBe(0);
  }
});

test("event badge results explain exact-grade rewards using the result metric", () => {
  const noop = () => {};
  for (const metric of ["eventItems", "eventPoints", "challengePoints"]) {
    const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: {
      goal: { kind: "skip" }, metric: { kind: metric }, phase: "done", elapsedMs: 10, optimality: { proven: true }, teams: [] } }));
    const html = renderToStaticMarkup(<DeckResult locale="en-US" goal="power" stale timeLimit={60} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
      job={{ status: "done", key: "badges", answer, stopped: false }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
    expect(html.includes("single matching result grade")).toBe(metric === "eventItems");
  }
});


test("CP conditions preserve the selected secondary priority and explicitly gate unsupported modes", () => {
  const input = defaultDeckGoalInput("challengePoints");
  const legacy = { goals: ["freeLive"], metrics: { freeLive: ["challengePoints"] }, accuracy: { great: true, just: false } };
  const render = (patch = {}, capabilities: DeckSolverCapabilities | null = legacy) => renderToStaticMarkup(
    <DeckGoalConditions locale="en-US" input={{ ...input, ...patch }} capabilities={capabilities} onChange={() => {}} />);
  expect(render()).toContain('value="none" selected=""');
  expect(render()).not.toContain("does not support CP-first");
  const capabilities = parseCapabilities(JSON.stringify({ ...legacy,
    eventItemRewards: { selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000 },
    challengePointPriorities: { priorities: ["eventPointsFirst", "eventItemsFirst"], objective: "lexicographicExpected", primary: "challengePoints", bestPrimaryOnly: true, lotteryFree: true } }))!;
  for (const secondaryPriority of ["eventPointsFirst", "eventItemsFirst"] as const) {
    const blocked = render({ secondaryPriority });
    expect(blocked).toContain(`value="${secondaryPriority}" selected=""`);
    expect(blocked).toContain("does not support CP-first");
    const supported = render({ secondaryPriority }, capabilities);
    expect(supported).toContain("Maximize average CP first");
    expect(supported).toContain("highest-CP tier only");
    expect(supported).not.toContain("does not support CP-first");
  }
  expect(render({ secondaryPriority: "eventPointsFirst" }, null)).toContain("does not support CP-first");
});

test("CP secondary results retain their priority, exact rewards and proof state after input changes", () => {
  const reward = (numerator: string, denominator: string) => ({ score: Number(numerator) / Number(denominator), exact: { numerator, denominator }, interval: null });
  const noop = () => {};
  for (const secondaryPriority of ["eventPointsFirst", "eventItemsFirst"]) {
    const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: {
      goal: { kind: "freeLive" }, metric: { kind: "challengePoints", secondaryPriority, resourceType: 1, resourceId: 90 }, aggregation: "expected", phase: "done", elapsedMs: 10,
      optimality: { proven: false, lowerBound: 75.5, upperBound: 75.5 }, exitReason: "timeLimit", teams: [{ rank: 1, rankCertified: false,
        leader: { member: 3, snap: null }, others: [1, 2, 4, 5].map(member => ({ member, snap: null })), power: 100,
        value: { score: 999999, payoff: reward("151", "2") },
        eventRewards: { challengePoints: reward("151", "2"), eventPoints: reward("901", "3"), eventItems: reward("39", "4") },
        orders: null, layout: { members: [1, 2, 3, 4, 5], snaps: [null, null, null, null, null] } }] } }));
    const html = renderToStaticMarkup(<DeckResult locale="en-US" goal="power" stale timeLimit={60} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
      job={{ status: "done", key: secondaryPriority, answer, stopped: false }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
    expect(html).toContain(secondaryPriority === "eventPointsFirst" ? "CP → PT → badges" : "CP → badges → PT");
    expect(html).toContain("Expected CP earned per live");
    expect(html).toContain("Expected points per live");
    expect(html).toContain("Expected badges per live");
    for (const fraction of ["151/2", "901/3", "39/4"]) expect(html).toContain(fraction);
    expect(html).toContain("75.5");
    expect(html).toContain("9.75");
    expect(html).toContain("Time limit reached");
    expect(html).toContain("not proven");
    expect(html).toContain("previous result");
    expect(html).toContain("fewer teams may qualify");
    expect(html).not.toContain('class="dr-bounds"');
    expect(html).not.toContain("999,999");
    expect((html.match(/class="dr-team"/g) ?? []).length).toBe(1);
    const ptIndex = html.indexOf("<dt>Expected points"), itemIndex = html.indexOf("<dt>Expected badges");
    expect(ptIndex < itemIndex).toBe(secondaryPriority === "eventPointsFirst");
  }
});

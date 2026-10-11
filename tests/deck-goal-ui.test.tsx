import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckGoalConditions from "../src/components/deck/DeckGoalConditions";
import DeckObjective from "../src/components/deck/DeckObjective";
import DeckResult from "../src/components/deck/DeckResult";
import DeckRewardMix from "../src/components/deck/DeckRewardMix";
import DeckWorkspace from "../src/components/deck/DeckWorkspace";
import { defaultDeckGoalInput, parseCapabilities, type DeckSolverCapabilities } from "../src/lib/deck/goals";
import { defaultRewardPlan, withRewardRate, withRewardRole, type EventReward, type RewardPlan, type RewardRole } from "../src/lib/deck/reward-mix";
import { parseDeckAnswer } from "../src/lib/deck/answer";

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

test("the objective has native labelled radio choices, with maximum gated by engine capabilities", () => {
  const cap = { goals: ["freeLive"], metrics: { freeLive: ["score", "eventPoints"] }, accuracy: { great: true, just: false } };
  const render = (input = defaultDeckGoalInput("free"), capabilities: DeckSolverCapabilities = cap) => renderToStaticMarkup(
    <DeckObjective locale="en-US" input={input} capabilities={capabilities} onChange={() => {}} />);
  const html = render();
  expect(html).toContain('type="radio"');
  expect(html).toContain('checked="" value="expected"');
  expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="maximum"/);
  expect(html).toContain("Average performance");
  expect(html).toContain("Theoretical maximum");
  expect(html).toContain("Theoretical maximum<small>Not yet supported</small>");
  const ready = render({ ...defaultDeckGoalInput("free"), aggregation: "maximum" }, { ...cap, aggregations: { maximum: { freeLive: ["score"] } } });
  expect(ready).toContain('checked="" value="maximum"');
  expect(ready).not.toContain('disabled=""');
  expect(ready).not.toContain("Not yet supported");
  expect(ready).toContain("not guaranteed every live");
  expect(ready).toContain("proved only when the search completes");
  const unavailable = render({ ...defaultDeckGoalInput("free"), aggregation: "maximum" });
  expect(unavailable).toMatch(/<input[^>]*disabled=""[^>]*checked=""[^>]*value="maximum"/);
  expect(unavailable).toContain("unavailable for these conditions");
  const loading = renderToStaticMarkup(<DeckObjective locale="en-US" input={{ ...defaultDeckGoalInput("free"), aggregation: "maximum" }} capabilities={null} onChange={() => {}} />);
  expect(loading).toMatch(/<input[^>]*disabled=""[^>]*checked=""[^>]*value="maximum"/);
  expect(loading).toContain("Checking whether theoretical maximum is available");
  expect(loading).not.toContain("Not yet supported");
  expect(render(defaultDeckGoalInput("power"))).toBe("");
  expect(render(defaultDeckGoalInput("skip"))).toBe("");
});

test("Gekisou scenes and payoff venues show the Expected note without an unavailable selection", () => {
  const cap = { goals: ["freeLive", "battleLive", "missionLive", "arenaLive"], metrics: {}, accuracy: { great: true, just: true },
    aggregations: { maximum: { battleLive: ["score"], missionLive: ["score"], arenaLive: ["score"] } } };
  for (const goal of ["battle", "mission", "arena"] as const) {
    const html = renderToStaticMarkup(<DeckObjective locale="en-US" input={{ ...defaultDeckGoalInput(goal), aggregation: "maximum" }} capabilities={cap} onChange={() => {}} />);
    expect(html).not.toContain('type="radio"');
    expect(html).toContain("Gekisou modes use Average performance");
  }
  for (const venue of ["battleLive", "missionLive", "arenaLive"] as const) {
    const html = renderToStaticMarkup(<DeckObjective locale="en-US" input={{ ...defaultDeckGoalInput("eventPoints"), venue, aggregation: "maximum" }} capabilities={cap} onChange={() => {}} />);
    expect(html).not.toContain('type="radio"');
    expect(html).toContain("Gekisou modes use Average performance");
  }
});

test("maximum results retain their own metric, objective, proof state and best order after inputs change", () => {
  const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: {
    goal: { kind: "freeLive" }, metric: { kind: "eventPoints" }, aggregation: "maximum", phase: "done", elapsedMs: 10,
    optimality: { proven: false, lowerBound: 30, upperBound: 40 }, teams: [{ rank: 1, rankCertified: false,
      leader: { member: 3, snap: null }, others: [1, 2, 4, 5].map(member => ({ member, snap: null })), power: 100,
      value: { score: 999999, payoff: { score: 30 } }, orders: null,
      bestOrder: { score: 950000, payoff: 30, order: [5, 4, 3, 2, 1] },
      layout: { members: [1, 2, 3, 4, 5], snaps: [null, null, null, null, null] } }] } }));
  const noop = () => {};
  const html = renderToStaticMarkup(<DeckResult locale="en-US" goal="battle" rateBasis={null} stale timeLimit={60} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
    job={{ status: "done", key: "maximum", answer, rate: null, stopped: false }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
  expect(html).toContain("Theoretical maximum");
  expect(html).toContain("Maximum points per live");
  expect(html).toContain("previous result");
  expect(html).toContain("not proven");
  expect(html).toContain("5 → 4 → 3 → 2 → 1");
  expect(html).not.toContain("Expected score");
  expect(html).not.toContain("performance orders");
  expect(html).not.toContain("999,999");
});

test("unproven results distinguish engine time limits, refinement stops and legacy answers", () => {
  const noop = () => {};
  for (const exitReason of ["refinementRequired", "timeLimit", undefined]) {
    const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: {
      goal: { kind: "freeLive" }, metric: { kind: "score" }, aggregation: "maximum", phase: "done", elapsedMs: 10,
      exitReason, optimality: { proven: false }, teams: [] } }));
    const render = (stopped: boolean) => renderToStaticMarkup(<DeckResult locale="en-US" goal="free" rateBasis={null} stale timeLimit={60} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
      job={{ status: "done", key: "maximum", answer, rate: null, stopped }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
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
  const html = renderToStaticMarkup(<DeckResult locale="en-US" goal="power" rateBasis={null} stale timeLimit={null} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
    job={{ status: "done", key: "old", answer, rate: null, stopped: false }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
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
    expect(html).not.toContain("<input");
  }
});

test("event badge results explain exact-grade rewards using the result metric", () => {
  const noop = () => {};
  for (const metric of ["eventItems", "eventPoints", "challengePoints"]) {
    const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: {
      goal: { kind: "skip" }, metric: { kind: metric }, phase: "done", elapsedMs: 10, optimality: { proven: true }, teams: [] } }));
    const html = renderToStaticMarkup(<DeckResult locale="en-US" goal="power" rateBasis={null} stale timeLimit={60} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
      job={{ status: "done", key: "badges", answer, rate: null, stopped: false }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
    expect(html.includes("single matching result grade")).toBe(metric === "eventItems");
  }
});


describe("reward plan", () => {
  const combinedMetric = { kind: "combined", field: "metric.levels", objective: "lexicographicWeightedExpectedSums", termMetrics: "metrics", weights: "integer",
    maxLevels: 4, maxTerms: 8, maxWeight: 1_000_000_000, consumption: "metric.consumption", lotteryFree: true };
  const rewards = ["eventPoints", "challengePoints", "eventItems"];
  const legacy = { goals: ["freeLive", "battleLive", "challengeLive"], metrics: { freeLive: rewards, battleLive: rewards, challengeLive: ["eventPoints", "eventItems"] }, accuracy: { great: true, just: false },
    eventItemRewards: { selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000 } };
  const capable = parseCapabilities(JSON.stringify({ ...legacy, combinedMetric }))!;
  const plan = (roles: [EventReward, RewardRole][], rates: Partial<Record<EventReward, number | null>> = {}): RewardPlan => {
    let value = defaultRewardPlan();
    for (const [kind, role] of roles) value = withRewardRole(value, kind, role);
    for (const [kind, rate] of Object.entries(rates)) value = withRewardRate(value, kind as EventReward, { auto: false, rate: rate ?? null });
    return value;
  };
  const songs = [{ id: 1, title: "First challenge", jacketUrl: null, difficulties: ["easy", "hard"] as const }, { id: 2, title: "Second challenge", jacketUrl: null, difficulties: [] }];
  const points = (patch = {}) => ({ ...defaultDeckGoalInput("eventPoints"), ...patch });
  const render = (input: ReturnType<typeof points>, capabilities: DeckSolverCapabilities | null = capable) => renderToStaticMarkup(
    <DeckRewardMix locale="en-US" input={input} capabilities={capabilities} challengeSongs={songs} onChange={() => {}} />);
  const role = (kind: string, value: string) => new RegExp(`<input[^>]*name="[^"]*-${kind}"[^>]*checked=""[^>]*value="${value}"`);

  const main = (kind: string) => new RegExp(`<input(?=[^>]*name="[^"]*-main")(?=[^>]*value="${kind}")(?=[^>]*checked="")[^>]*>`);
  const mainOff = (kind: string) => new RegExp(`<input(?=[^>]*name="[^"]*-main")(?=[^>]*value="${kind}")(?=[^>]*disabled="")[^>]*>`);

  test("only event payoff goals offer it, and every other reward starts left out", () => {
    for (const goal of ["battle", "free", "skip", "power", "challenge"] as const) expect(render(points({ goal }))).toBe("");
    const html = render(points());
    expect(html).toMatch(main("eventPoints"));
    expect(html).toContain("Goal");
    expect(html).toContain("Event points per live.");
    expect(html).toContain("Other rewards of the same live");
    expect((html.match(/<li class="rm-row"/g) ?? []).length).toBe(2);
    for (const kind of ["challengePoints", "eventItems"]) expect(html).toMatch(role(kind, "off"));
    expect(html).toContain('aria-label="How Challenge points count"');
    expect(html).toContain('<span class="rm-chip" data-reward="eventPoints">PT</span>');
    expect(html).not.toContain("rm-detail");
    const challengePoints = render(points({ goal: "challengePoints" }));
    expect(challengePoints).toMatch(main("challengePoints"));
    expect(challengePoints).not.toMatch(main("eventPoints"));
    expect(challengePoints).toContain('aria-label="How Event points count"');
  });

  test("challenge points are rated by a challenge live unless the player states a rate", () => {
    const html = render(points({ rewards: plan([["challengePoints", "convert"]]), challengeMusicId: 1, rateDifficulty: "hard", challengePoints: 800 }));
    expect(html).toMatch(role("challengePoints", "convert"));
    expect(html).toMatch(/<input[^>]*name="[^"]*-source"[^>]*checked=""\/><span>From a Challenge Live<\/span>/);
    expect(html).toContain("1 CP then counts as the PT that team earns per CP spent.");
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>.*?First challenge/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>.*?Second challenge/);
    // The chosen song's own difficulties, and the challenge points one live spends.
    expect(html).toContain('<option value="hard" selected="">HARD</option>');
    expect(html).not.toContain('<option value="expert"');
    expect(html).toContain('<option value="800" selected="">');
    expect(html).toContain('data-reward="challengePoints">CP<span aria-hidden="true">×</span><b>auto</b></span>');
    expect(html).not.toContain('type="number"');
    const stated = render(points({ rewards: plan([["challengePoints", "convert"]], { challengePoints: 17.5 }) }));
    expect(stated).toMatch(/<input[^>]*name="[^"]*-source"[^>]*checked=""\/><span>My own rate<\/span>/);
    expect(stated).toMatch(/<input[^>]*type="number"[^>]*aria-label="How many PT one CP is worth"[^>]*aria-invalid="false"[^>]*value="17.5"/);
    expect(stated).toContain('data-reward="challengePoints">CP<span aria-hidden="true">×</span><b>17.5</b></span>');
    expect(stated).not.toContain("First challenge");
    // A challenge-point goal has no challenge live to read; its other rewards take stated rates.
    const cp = render(points({ goal: "challengePoints", rewards: plan([["eventPoints", "convert"]], { eventPoints: 0.05 }) }));
    expect(cp).not.toContain("From a Challenge Live");
    expect(cp).toMatch(/<input[^>]*type="number"[^>]*aria-label="How many CP one PT is worth"[^>]*value="0.05"/);
  });

  test("tie-break rewards show their order and offer to move ahead", () => {
    const html = render(points({ goal: "challengePoints", rewards: plan([["eventPoints", "tieBreak"], ["eventItems", "tieBreak"]]) }));
    expect(html).toMatch(role("eventPoints", "tieBreak"));
    expect(html).toContain("Teams equal on everything above are ranked by PT next.");
    expect(html).toContain("Teams also equal on PT are ranked by Badges.");
    expect((html.match(/Compare this first/g) ?? []).length).toBe(1);
    expect(html).toContain('<span class="rm-chip" data-reward="challengePoints">CP</span><span class="rm-then">then</span><span class="rm-chip" data-reward="eventPoints">PT</span><span class="rm-then">then</span><span class="rm-chip" data-reward="eventItems">Badges</span>');
    expect(html).not.toContain("rm-issue");
  });

  test("an incomplete plan asks for a rate and a challenge live cannot count challenge points", () => {
    const unset = render(points({ rewards: plan([["eventItems", "convert"]]) }));
    expect(unset).toMatch(/<input[^>]*type="number"[^>]*aria-invalid="true"/);
    expect(unset).toContain("Enter a rate above 0 for every reward that is added in.");
    const challenge = render(points({ venue: "challengeLive", rewards: plan([["challengePoints", "convert"]], { challengePoints: 17.5 }) }));
    expect(challenge).toContain("A Challenge Live spends CP and earns none.");
    expect(challenge).toContain('data-reward="challengePoints" data-role="off" data-offered="false"');
    expect(challenge).not.toContain('type="number"');
    // A challenge live cannot have challenge points as its goal either.
    expect(challenge).toMatch(mainOff("challengePoints"));
    expect(challenge).not.toMatch(mainOff("eventItems"));
    expect(unset).not.toMatch(mainOff("challengePoints"));
  });

  test("engines without levelled metrics, loading engines and other objectives gate the plan", () => {
    const old = render(points(), parseCapabilities(JSON.stringify(legacy))!);
    expect(old).toMatch(/<input[^>]*disabled=""[^>]*value="convert"/);
    expect(old).toMatch(/<input[^>]*disabled=""[^>]*value="tieBreak"/);
    expect(old).not.toMatch(/<input[^>]*disabled=""[^>]*value="off"/);
    expect(old).toContain("does not rank by other rewards yet");
    const planned = points({ rewards: plan([["challengePoints", "convert"]], { challengePoints: 17.5 }) });
    expect(render(planned, parseCapabilities(JSON.stringify(legacy))!)).toContain("does not rank by other rewards for these conditions");
    const loading = render(planned, null);
    expect(loading).not.toContain("does not rank by other rewards");
    expect(loading).not.toMatch(/<input[^>]*disabled=""[^>]*value="convert"/);
    expect(render({ ...planned, aggregation: "maximum" })).toContain("requires Average performance");
    expect(render({ ...planned, venue: "battleLive" })).toContain("LUCK lotteries");
    expect(render(planned)).not.toContain("LUCK lotteries");
    expect(render(points({ venue: "battleLive" }))).not.toContain("LUCK lotteries");
    const objective = renderToStaticMarkup(<DeckObjective locale="en-US" input={{ ...planned, aggregation: "maximum" }} capabilities={capable} onChange={() => {}} />);
    expect(objective).toMatch(/<input[^>]*checked=""[^>]*value="maximum"/);
  });

  const value = (numerator: number) => ({ score: numerator / 120, exact: { numerator: String(numerator), denominator: "120" }, interval: null });
  const team = (payoff: number, levels: object[]) => ({ rank: 1, rankCertified: true, leader: { member: 3, snap: null }, others: [1, 2, 4, 5].map(member => ({ member, snap: null })), power: 100,
    value: { score: 900000, payoff: value(payoff) }, levels, orders: null, layout: { members: [1, 2, 3, 4, 5], snaps: [null, null, null, null, null] } });
  const answerOf = (metric: object, teams: object[], optimality: object = { proven: true, lowerBound: 4000, upperBound: 4000 }) => parseDeckAnswer(JSON.stringify({
    format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: { goal: { kind: "freeLive" }, aggregation: "expected", phase: "done", elapsedMs: 10, optimality, metric, teams } }));
  const noop = () => {};
  const shown = (job: Parameters<typeof DeckResult>[0]["job"], rateBasis: Parameters<typeof DeckResult>[0]["rateBasis"] = null, stale = false) => renderToStaticMarkup(
    <DeckResult locale="en-US" goal="eventPoints" rateBasis={rateBasis} stale={stale} timeLimit={60} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
      job={job} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
  const mixedLevels = [[{ kind: "eventPoints", eventId: 7, weight: 2 }, { kind: "challengePoints", eventId: 7, weight: 35 }], [{ kind: "eventItems", eventId: 7, resourceType: 1, resourceId: 90, weight: 1 }]];
  const mixedAnswer = () => answerOf({ kind: "combined", consumption: 1, levels: mixedLevels },
    [team(480000, [{ value: value(480000), terms: [value(120000), value(6857.142857142857)] }, { value: value(1170), terms: [value(1170)] }])]);

  test("results show the total in the goal's reward, every reward's part and the tie-break rewards", () => {
    const html = shown({ status: "done", key: "mix", answer: mixedAnswer(), rate: null, stopped: false });
    expect(html).toContain("Ranked by");
    expect(html).toContain('data-reward="challengePoints">CP<span aria-hidden="true">×</span><b>17.5</b></span><span class="rm-then">then</span><span class="rm-chip" data-reward="eventItems">Badges</span>');
    expect(html).toContain("Expected total per live, as PT");
    // 480000 / 120 weighted, shown per unit of the goal's weight 2.
    expect(html).toContain("<strong>2,000</strong>");
    expect(html).toContain("What the total is made of");
    expect(html).toContain('aria-label="PT 50%, CP 50%"');
    expect(html).toContain("<strong>1,000</strong>");
    expect(html).toContain("<strong>57.14</strong><small>× 17.5 = 1,000 PT</small>");
    expect(html).toContain('<h4>Tie-breaks</h4><ol><li data-reward="eventItems"><i class="rm-dot" aria-hidden="true"></i><span>Badges</span><strong>9.75</strong></li></ol>');
    expect(html).toContain("single matching result grade");
    expect(html).not.toContain("Expected points per live");
    expect(html).not.toContain("How CP was rated");
    expect(html).not.toContain("999,999");
  });

  test("a goal ranked by its own reward and tie-breaks keeps that reward's label and bounds", () => {
    const answer = answerOf({ kind: "combined", consumption: 1, levels: [[{ kind: "challengePoints", eventId: 7, weight: 1 }], [{ kind: "eventPoints", eventId: 7, weight: 1 }], [mixedLevels[1]![0]]] },
      [team(9060, [{ value: value(9060), terms: [value(9060)] }, { value: value(36040), terms: [value(36040)] }, { value: value(1170), terms: [value(1170)] }])],
      { proven: false, lowerBound: 75.5, upperBound: 80 });
    const html = shown({ status: "done", key: "ties", answer, rate: null, stopped: false }, null, true);
    expect(html).toContain("Expected CP earned per live");
    expect(html).toContain("<strong>75.5</strong>");
    expect(html).not.toContain("Expected total per live");
    expect(html).not.toContain("What the total is made of");
    expect(html).toMatch(/Tie-breaks<\/h4><ol><li data-reward="eventPoints">.*?<strong>300.33<\/strong><\/li><li data-reward="eventItems">.*?<strong>9.75<\/strong>/);
    expect(html).toContain('class="dr-bounds"');
    expect(html).toContain("not proven");
    expect(html).toContain("previous result");
    expect((html.match(/class="dr-team"/g) ?? []).length).toBe(1);
  });

  test("a rated run names what a challenge point counted as and the challenge live behind it", () => {
    const rate = answerOf({ kind: "eventPoints", eventId: 7, consumption: 400 }, [{ ...team(840000, []), levels: undefined }]);
    const basis = { song: "First challenge", difficulty: "hard", cost: 400 };
    const html = shown({ status: "done", key: "rated", answer: mixedAnswer(), rate, stopped: false }, basis);
    expect(html).toContain('aria-label="How CP was rated"');
    expect(html).toContain("<strong>1 CP = 17.5 PT</strong>");
    expect(html).toContain("Challenge Live &quot;First challenge&quot; HARD at 400 CP per live: its best team is expected to earn the equivalent of 7,000 PT.");
    expect(html).toContain("Show this challenge team");
    expect(html).toContain("Proven optimal");
    expect(html).not.toContain("may be worth more");
    // A challenge team that is not proven best leaves the whole run unproven.
    const open = answerOf({ kind: "eventPoints", eventId: 7, consumption: 400 }, [{ ...team(840000, []), levels: undefined }], { proven: false, lowerBound: 7000, upperBound: 7100 });
    const unproven = shown({ status: "done", key: "rated", answer: mixedAnswer(), rate: open, stopped: false }, basis);
    expect(unproven).toContain("1 CP may be worth more");
    expect(unproven).not.toContain("Proven optimal");
    // While the challenge live is being solved its teams are not listed as the goal's.
    const rating = shown({ status: "running", key: "rated", startedAt: 0, stage: "rate", rate: null, progress: rate }, basis);
    expect(rating).toContain("Finding the best Challenge Live team");
    expect(rating).toContain("works out what 1 CP is worth");
    expect(rating).not.toContain('class="dr-team"');
    const searching = shown({ status: "running", key: "rated", startedAt: 0, stage: "goal", rate, progress: mixedAnswer() }, basis);
    expect(searching).toContain("<strong>1 CP = 17.5 PT</strong>");
    expect((searching.match(/class="dr-team"/g) ?? []).length).toBe(1);
  });
});

import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckGoalConditions from "../src/components/deck/DeckGoalConditions";
import DeckResult from "../src/components/deck/DeckResult";
import { defaultDeckGoalInput } from "../src/lib/deck/goals";
import { parseDeckAnswer } from "../src/lib/deck/answer";

test("life goal visibly requires an explicit play and does not silently select a no-Miss pattern", () => {
  const html = renderToStaticMarkup(<DeckGoalConditions locale="en-US" input={{ ...defaultDeckGoalInput("free"), scoreMetric: "scoreAndLife" }}
    event={null} capabilities={{ goals: ["freeLive"], metrics: { freeLive: ["score", "scoreAndLife"] }, accuracy: { great: true, just: false }, patternPlay: true }} onChange={() => {}} />);
  expect(html).toContain("Choose an explicit complete play");
  expect(html).toContain('value="accuracy" selected=""');
  expect(html).not.toContain('value="pattern" selected=""');
  expect(html).toContain("Minimum life at the end");
});

test("a stale score-goal selection cannot relabel a probability result or round 1/3 to zero", () => {
  const exact = { numerator: "1", denominator: "3" };
  const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", missing: [], errors: [], result: {
    goal: { kind: "freeLive", play: { kind: "pattern", judged: 100, misses: 10 } }, metric: { kind: "scoreAndLife" }, phase: "done", elapsedMs: 10,
    optimality: { proven: true }, account: { cards: { coversAllOwnedCards: true } }, teams: [{ rank: 1, rankCertified: true,
      leader: { member: 3, snap: null }, others: [1, 2, 4, 5].map(member => ({ member, snap: null })), power: 100,
      value: { score: 999999, exact: null, interval: null, payoff: { score: 0, exact, interval: null } }, orders: null,
      layout: { members: [1, 2, 3, 4, 5], snaps: [null, null, null, null, null] } }] } }));
  const noop = () => {};
  const html = renderToStaticMarkup(<DeckResult locale="en-US" goal="power" stale box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
    job={{ status: "done", key: "old", answer, stopped: false }} onStop={noop} onRerun={noop} onEditCard={noop} onPlayer={noop} onAnswerAll={noop} />);
  expect(html).toContain("Score and final-life probability");
  expect(html).toContain("0.333333 – 0.333334");
  expect(html).toContain("100 judged notes · 10 Misses");
  expect(html).not.toContain("999,999");
});

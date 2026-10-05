import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckGoalConditions from "../src/components/deck/DeckGoalConditions";
import DeckResult from "../src/components/deck/DeckResult";
import { defaultDeckGoalInput } from "../src/lib/deck/goals";
import { parseDeckAnswer } from "../src/lib/deck/answer";

test("a live goal offers the accuracy and pattern plays and no objective other than the expected score", () => {
  const html = renderToStaticMarkup(<DeckGoalConditions locale="en-US" input={{ ...defaultDeckGoalInput("free"), playMode: "pattern", missEvery: 10 }}
    event={null} capabilities={{ goals: ["freeLive"], metrics: { freeLive: ["score"] }, accuracy: { great: true, just: false }, patternPlay: true }} onChange={() => {}} />);
  expect(html).toContain('value="pattern" selected=""');
  expect(html).toContain('value="10"');
  expect(html).not.toContain("Minimum life at the end");
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

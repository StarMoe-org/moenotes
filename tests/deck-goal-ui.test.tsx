import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckGoalConditions from "../src/components/deck/DeckGoalConditions";
import DeckResult from "../src/components/deck/DeckResult";
import DeckWorkspace from "../src/components/deck/DeckWorkspace";
import { defaultDeckGoalInput } from "../src/lib/deck/goals";
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

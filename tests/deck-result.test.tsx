import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckResult from "../src/components/deck/DeckResult";
import { createBox } from "../src/lib/box/model";
import type { DeckAnswer, DeckIssue } from "../src/lib/deck/answer";
import { t } from "../src/i18n";
import type { AppLocale } from "../src/config/locales";

const render = (locale: AppLocale, errors: DeckIssue[]) => {
  const box = createBox("tw", "box", 1);
  box.save = { server: "intl", accountId: "20000000001", sha256: "a".repeat(64), uploadedAt: 1 };
  const answer: DeckAnswer = { final: true, status: "invalid", missing: [], errors, result: null };
  return renderToStaticMarkup(<DeckResult locale={locale} goal="power" stale={false} timeLimit={30} box={box} catalog={{ members: [], snaps: [] }} linked busy={false}
    job={{ status: "done", key: "input", answer, stopped: false }} onStop={() => {}} onRerun={() => {}} onEditCard={() => {}} onPlayer={() => {}} onAnswerAll={() => {}} />);
};
test("grouped memory validation errors retain their diagnostic path, code and reason", () => {
  const error = { path: "_player._memory._members[0]._unlocked", code: "invalid_type", message: "Expected a boolean" };
  const html = render("en-US", [error]);
  expect(html).toContain(error.path); expect(html).toContain(error.code); expect(html).toContain(error.message);
  expect(html).toContain('class="dr-issue-details"');
});
test("unrecognized linked save records name calculation data separately in the core locales", () => {
  for (const locale of ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const) {
    const html = render(locale, [{ path: "_player._memory._supports[0]._id", code: "unknown_id", message: "Unknown snap identity" }]);
    expect(html).toContain(t(locale, "deckWorkspace.solver.statusNote.invalidDataLinked"));
    expect(html).toContain("_player._memory._supports[0]._id");
  }
});

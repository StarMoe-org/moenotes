import { describe, expect, test } from "bun:test";
import { CONTENT_KIND_ORDER, KIND_LABEL_KEY } from "../src/lib/search/kinds";
import { t } from "../src/i18n";

describe("search kinds", () => {
  test("every kind has one place in the order and a label in each core locale", () => {
    expect(new Set(CONTENT_KIND_ORDER).size).toBe(CONTENT_KIND_ORDER.length);
    expect(Object.keys(KIND_LABEL_KEY).sort()).toEqual([...CONTENT_KIND_ORDER].sort());
    for (const kind of CONTENT_KIND_ORDER) {
      for (const locale of ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const) expect(t(locale, KIND_LABEL_KEY[kind])).not.toBe("");
    }
  });

  test("results group in the kind order, kinds without results left out (SearchPage / CommandPalette)", () => {
    // The pages' grouping: seed every kind in order, fill, drop the empty ones.
    const results = [...CONTENT_KIND_ORDER].reverse().map((kind, index) => ({ kind, id: index }));
    const byKind = new Map(CONTENT_KIND_ORDER.map((kind) => [kind, [] as typeof results]));
    for (const result of results.filter((_, index) => index % 2 === 0)) byKind.get(result.kind)!.push(result);
    const groups = CONTENT_KIND_ORDER.map((kind) => ({ kind, results: byKind.get(kind)! })).filter((group) => group.results.length > 0);
    const order = groups.map((group) => CONTENT_KIND_ORDER.indexOf(group.kind));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(groups.length).toBe(Math.ceil(CONTENT_KIND_ORDER.length / 2));
  });
});

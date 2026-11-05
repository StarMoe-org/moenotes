import { describe, expect, test } from "bun:test";
import { findRouteMatch } from "../src/lib/route/registry";

describe("a route declares a filter sheet only when its page has one", () => {
  test("the main story lists chapter groups, so it has no filter sheet", () => {
    expect(findRouteMatch("/story/main")?.item.filterTitleKey).toBeUndefined();
  });

  test("the other story categories still label their filter sheet", () => {
    for (const path of ["/story/event", "/story/friendship", "/story/birthday", "/story/other"]) {
      expect(findRouteMatch(path)?.item.filterTitleKey).toBeTruthy();
    }
  });
});

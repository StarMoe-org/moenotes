import { describe, expect, test } from "bun:test";
import { isSpoiler } from "../src/lib/settings/spoiler";

describe("spoiler clock", () => {
  test("an explicit clock decides", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(isSpoiler(now + 60_000, now)).toBe(true);
    expect(isSpoiler(now - 60_000, now)).toBe(false);
  });

  test("without a live clock it uses the page's serialized reference", () => {
    // No `now` covers SSR and the first client render: both sides must hide the same items.
    expect(isSpoiler(Date.now() + 60_000, null)).toBe(true);
    expect(isSpoiler(Date.now() - 60_000, null)).toBe(false);
  });

  test("empty or invalid start times are not spoilers", () => {
    expect(isSpoiler(null, null)).toBe(false);
    expect(isSpoiler("", null)).toBe(false);
    expect(isSpoiler("not a date", null)).toBe(false);
  });
});

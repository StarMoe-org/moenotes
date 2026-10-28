import { describe, expect, test } from "bun:test";
import { SPOILER_REFERENCE_NOW } from "../src/lib/settings/spoiler-reference";
import { isSpoiler } from "../src/lib/settings/spoiler";

describe("spoiler clock", () => {
  test("an explicit clock decides", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(isSpoiler(now + 60_000, now)).toBe(true);
    expect(isSpoiler(now - 60_000, now)).toBe(false);
  });

  test("without a live clock it uses the page's serialized reference", () => {
    // The reference is fixed when the module loads, so a fixed offset from it (not Date.now()) keeps this stable
    // even when the whole suite runs for minutes, as it does in CI.
    expect(isSpoiler(SPOILER_REFERENCE_NOW + 60_000, null)).toBe(true);
    expect(isSpoiler(SPOILER_REFERENCE_NOW - 60_000, null)).toBe(false);
  });

  test("empty or invalid start times are not spoilers", () => {
    expect(isSpoiler(null, null)).toBe(false);
    expect(isSpoiler("", null)).toBe(false);
    expect(isSpoiler("not a date", null)).toBe(false);
  });
});

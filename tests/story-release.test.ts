import { describe, expect, test } from "bun:test";
import type { ServerFaceted } from "../src/lib/servers/facets";
import { isStoryReleasedAcrossServers, isStoryReleasedAt, isStoryReleasedForServer, parseStoryReleaseTime, storyReleaseDates, type StoryReleaseGated } from "../src/lib/story/release";

describe("regional story release gate", () => {
  const now = Date.UTC(2026, 9, 27, 12);
  const story: ServerFaceted<{ startAt: string }> = {
    startAt: "2026/10/01 12:00:00",
    servers: ["tw", "jp"],
    serverVariants: { jp: { startAt: "2026/11/01 12:00:00" } },
  };

  test("uses each server's own in-game release time rather than the first server's date", () => {
    expect(storyReleaseDates(story)).toEqual({
      tw: "2026/10/01 12:00:00",
      jp: "2026/11/01 12:00:00",
    });
    expect(isStoryReleasedForServer(story, "tw", now)).toBe(true);
    expect(isStoryReleasedForServer(story, "jp", now)).toBe(false);
    expect(isStoryReleasedAcrossServers(story, now)).toBe(false);
  });

  test("opens only after every region containing the story has officially released it", () => {
    const released = { ...story, serverVariants: { jp: { startAt: "2026/10/20 12:00:00" } } };
    expect(isStoryReleasedAcrossServers(released, now)).toBe(true);
  });

  test("untimed categories pass the date gate while dated categories still fail closed", () => {
    for (const category of ["friendship", "live-result", "tutorial"]) {
      const untimed: StoryReleaseGated = { startAt: "", servers: ["tw", "jp"], category };
      expect(isStoryReleasedAcrossServers(untimed, now)).toBe(true);
      expect(isStoryReleasedForServer(untimed, "tw", now)).toBe(true);
      expect(isStoryReleasedAcrossServers({ ...untimed, servers: [] }, now)).toBe(false);
      expect(isStoryReleasedAcrossServers(untimed, Number.NaN)).toBe(false);
    }
    // A region whose MasterData does not list the story still fails closed.
    expect(isStoryReleasedForServer({ startAt: "", servers: ["tw"], category: "friendship" }, "jp", now)).toBe(false);
    // Scheduled categories keep failing closed on a missing date.
    expect(isStoryReleasedAcrossServers({ startAt: "", servers: ["tw"], category: "main" }, now)).toBe(false);
    expect(isStoryReleasedAcrossServers({ startAt: "", servers: ["tw"], category: "home" }, now)).toBe(false);
  });

  test("fails closed when no region has the story or a regional date is missing", () => {
    expect(isStoryReleasedAcrossServers({ startAt: "", servers: [] }, now)).toBe(false);
    expect(isStoryReleasedAcrossServers({ startAt: "2026/10/01 12:00:00", servers: ["tw"], serverVariants: { tw: { startAt: "" } } }, now)).toBe(false);
  });

  test("does not treat missing, malformed, or impossible release dates as already released", () => {
    for (const value of [undefined, null, "", "null", "not a date", "2026/02/29 12:00:00", "2026/10/27 25:00:00", "2026/10/27 12:00:00+15:00"]) {
      expect(parseStoryReleaseTime(value)).toBeNull();
      expect(isStoryReleasedAt(value, now)).toBe(false);
    }
  });

  test("release boundary is inclusive and a non-finite clock fails closed", () => {
    const release = "2026/10/27 20:00:00+08:00";
    const releaseTime = parseStoryReleaseTime(release);
    expect(releaseTime).not.toBeNull();
    expect(isStoryReleasedAt(release, releaseTime! - 1)).toBe(false);
    expect(isStoryReleasedAt(release, releaseTime!)).toBe(true);
    expect(isStoryReleasedAt(release, Number.NaN)).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { announcementSrcdoc, isUpdatedSinceSeen, newsCategory } from "../src/lib/game-api/announcements";
import { challengeReadable, hasPointRanking, pointRankingReadable, rewardBoundaries } from "../src/lib/game-api/events";
import { parseEventTrackerSearch } from "../src/lib/game-api/links";
import { levelFromExp, toRankingRows } from "../src/lib/game-api/music-ranking";
import { defaultGameServer, formatAge, parseGameSeconds } from "../src/lib/game-api/server";

describe("music ranking rows", () => {
  test("places come from the scores and tied scores share the better place", () => {
    const rows = toRankingRows({
      players: [
        { score: 900, playerData: { id: "c", name: "C" } },
        { score: 1000, playerData: { id: "a", name: "A" } },
        { score: 900, playerData: { id: "b", name: "B" } },
        { score: 800, playerData: { id: "d", name: "D" } },
      ],
    });
    expect(rows.map((row) => [row.uid, row.rank, row.tied])).toEqual([["a", 1, false], ["c", 2, true], ["b", 2, true], ["d", 4, false]]);
  });

  test("an empty ranking is {} and missing fields do not throw", () => {
    expect(toRankingRows({})).toEqual([]);
    const [row] = toRankingRows({ players: [{}] });
    expect(row).toMatchObject({ rank: 1, name: "", score: 0, totalPower: null, cards: [] });
  });

  test("deck slots are ordered by slotIndex; the first slot comes without one", () => {
    const [row] = toRankingRows({
      players: [{
        score: 1,
        highScoreDeck: {
          totalPower: 1_483_584,
          cards: [
            { slotIndex: 2, memberCard: { cardId: "55" } },
            { memberCard: { cardId: "51", awakeCount: 5, cardRank: 5 }, supportCard: { cardId: "59", rank: 5 } },
            { slotIndex: 1, memberCard: { cardId: "x" } },
          ],
        },
      }],
    });
    expect(row?.cards.map((card) => card.memberCardId)).toEqual([51, null, 55]);
    expect(row?.cards[0]).toMatchObject({ cardRank: 5, supportCardId: 59, supportRank: 5 });
  });

  test("a card's level is the highest level its total exp reaches", () => {
    const table = [0, 100, 250, 450];
    expect(levelFromExp(table, 0)).toBe(1);
    expect(levelFromExp(table, 249)).toBe(2);
    expect(levelFromExp(table, 250)).toBe(3);
    expect(levelFromExp(table, 9999)).toBe(4);
    expect(levelFromExp(undefined, 250)).toBeNull();
    expect(levelFromExp(table, null)).toBeNull();
  });
});

describe("event challenge boards", () => {
  test("keep the game's order, number rows index + 1 and never mark ties", () => {
    const rows = toRankingRows({
      players: [
        { score: 1000, playerData: { id: "a" } },
        { score: 1000, playerData: { id: "b" } },
        { score: 1200, playerData: { id: "c" } },
      ],
    }, "response");
    expect(rows.map((row) => [row.uid, row.rank, row.tied])).toEqual([["a", 1, false], ["b", 2, false], ["c", 3, false]]);
  });

  test("a player listed twice keeps both rows under distinct keys", () => {
    const rows = toRankingRows({ players: [{ score: 2, playerData: { id: "a" } }, { score: 1, playerData: { id: "a" } }] }, "response");
    expect(rows.map((row) => row.uid)).toEqual(["a", "a#1"]);
  });

  test("reward band ends become sorted, unique cut-offs", () => {
    const challenge = {
      challengeMusicId: "1", musicId: "100109", rankingEnabled: true, collectStatus: "collecting" as const,
      rewardBands: [{ rankStart: 11, rankEnd: 100 }, { rankStart: 1, rankEnd: 1 }, { rankStart: 4, rankEnd: 10 }, { rankStart: 4, rankEnd: 10 }],
    };
    expect(rewardBoundaries(challenge)).toEqual([1, 10, 100]);
    expect(challengeReadable(challenge)).toBe(true);
    expect(challengeReadable({ ...challenge, collectStatus: "pending" })).toBe(false);
  });

  test("a disabled point ranking does not hide the event's challenge songs", () => {
    const event = { eventId: "1", startAt: 0, endAt: 1, eventStatus: "nowOn" as const, collectStatus: "disabled" as const, rankingDisabled: true, pointRanking: { enabled: false, collectStatus: "disabled" as const } };
    expect(hasPointRanking(event)).toBe(false);
    expect(pointRankingReadable(event)).toBe(false);
    expect(hasPointRanking({ ...event, pointRanking: { enabled: true, collectStatus: "collecting" } })).toBe(true);
  });

  test("tracker links keep only valid query parts", () => {
    expect(parseEventTrackerSearch("?server=jp&event=12&song=3")).toEqual({ server: "jp", event: "12", song: "3" });
    expect(parseEventTrackerSearch("?server=xx&event=abc")).toEqual({ server: null, event: null, song: null });
  });
});

describe("announcements", () => {
  test("game categories map to message keys, unknown ones to other", () => {
    expect(newsCategory("MAINTENANCE")).toBe("maintenance");
    expect(newsCategory("GACHA")).toBe("gacha");
    expect(newsCategory("SOMETHING_NEW")).toBe("other");
    expect(newsCategory(undefined)).toBe("other");
  });

  test("the dark backdrop goes into the head and leaves the doctype first", () => {
    const doc = announcementSrcdoc("<!DOCTYPE html>\n<html>\n<head>\n<style>body{color:#fff}</style></head><body><p>x</p></body></html>");
    expect(doc.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(doc.indexOf("color-scheme:dark")).toBeLessThan(doc.indexOf("body{color:#fff}"));
    expect(doc).toContain("<body><p>x</p></body>");
    expect(announcementSrcdoc("<p>x</p>").endsWith("<p>x</p>")).toBe(true);
  });

  test("the updated badge needs an opened version older than the listed one", () => {
    const item = { id: "2", lastUpdatedAt: "1790669340" };
    expect(isUpdatedSinceSeen(item, {})).toBe(false);
    expect(isUpdatedSinceSeen(item, { "2": "1790669340" })).toBe(false);
    expect(isUpdatedSinceSeen(item, { "2": "1790597820" })).toBe(true);
  });
});

describe("game servers", () => {
  test("default server per site language", () => {
    expect(defaultGameServer("zh-CN")).toBe("tw");
    expect(defaultGameServer("zh-TW")).toBe("tw");
    expect(defaultGameServer("ja-JP")).toBe("jp");
    expect(defaultGameServer("ko-KR")).toBe("kr");
    expect(defaultGameServer("fr-FR")).toBe("en");
  });

  test("game times are Unix seconds as strings", () => {
    expect(parseGameSeconds("1790677800")).toBe(1_790_677_800_000);
    expect(parseGameSeconds("")).toBeNull();
    expect(parseGameSeconds(undefined)).toBeNull();
  });

  test("ages never go negative when the game's clock runs ahead", () => {
    expect(formatAge(2_000_000, 1_000_000, "en-US")).toBe("now");
    expect(formatAge(0, 12 * 60_000, "en-US")).toBe("12 minutes ago");
    expect(formatAge(0, 3 * 3_600_000, "en-US")).toBe("3 hours ago");
  });
});

import { describe, expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import { parseStoryTables } from "../src/lib/story/parser";

const table = <T>(allData: T[]) => ({ header: [], allData });
const text = (id: string, simplifiedChinese: string) => ({ id, simplifiedChinese });

function parse(episode: Record<string, unknown>[], texts: { id: string; simplifiedChinese: string }[], extra: {
  video?: Record<string, unknown>[];
  chatIcons?: Record<string, string>;
  stillCaptions?: { assetName: string; open: number; close: number; text: string }[];
} = {}) {
  return parseStoryTables("adv_script_test", {
    episode: table(episode.map((row, index) => ({ index, ...row }))),
    text: table(texts),
    sound: table([]),
    cueSheets: table([]),
    video: extra.video ? table(extra.video) : undefined,
  }, "zh-CN", { chatIcons: extra.chatIcons, stillCaptions: extra.stillCaptions });
}

describe("story parser", () => {
  test("clip lines become the clip's subtitles, speakers resolved through dialogue rows", () => {
    const script = parse([
      { command: 2, targetName: "raika", targetTextIDs: ["adv_raika"], advTextID: "t1" },
      { command: 27, videoID: 41 },
      { command: 28, targetName: "raika", advTextID: "t2" },
      { command: 28, targetName: "arale・raika", advTextID: "t3" },
      { command: 28, targetName: "", advTextID: "" },
      { command: 27, parameter3: "SkipClipTarget" },
      { command: 2, targetName: "raika", targetTextIDs: ["adv_raika", "adv_arale"], advTextID: "t4" },
    ], [text("adv_raika", "蕾叶"), text("adv_arale", "阿拉蕾"), text("t1", "一"), text("t2", "二"), text("t3", "三"), text("t4", "四")], {
      video: [{ id: 41, assetName: "adv/adv_movie_a/adv_movie_a", width: 1920, height: 1080, note: "ライブシーン" }],
    });

    expect(script.lines.map((line) => [line.text, line.speaker, line.videoId])).toEqual([
      ["一", "蕾叶", undefined],
      ["二", "蕾叶", 41],
      ["三", "阿拉蕾・蕾叶", 41],
      ["四", "蕾叶・阿拉蕾", undefined],
    ]);
    expect(script.timeline[1]).toEqual({
      kind: "video",
      video: { id: 41, url: `${assetConfig.api}/zh-Hans/Cri/Video/adv/adv_movie_a/adv_movie_a/adv_movie_a.mp4`, note: "ライブシーン", width: 1920, height: 1080 },
    });
  });

  test("chat messages group by window, side follows the owner's icon, replayed history and typed-then-sent repeats are dropped", () => {
    const script = parse([
      { command: 36, targetName: "advchat_miku_mother_01", targetTextIDs: ["advchat_mother_01"], targetChatID: 1 },
      { command: 37, targetTextIDs: ["advchat_mother_01"], targetChatID: 2, advTextID: "m1" },
      { command: 36, targetName: "advchat_miku_mother_01" },
      { command: 36, targetName: "advchat_miku_mother_nosound_01", targetTextIDs: ["advchat_mother_01"], targetChatID: 1 },
      { command: 37, targetTextIDs: ["advchat_mother_01"], targetChatID: 2, advTextID: "m1b" },
      { command: 37, targetTextIDs: ["advchat_miku_01"], targetChatID: 1, advTextID: "m2" },
      { command: 65, targetName: "advchat_miku_01", advTextID: "m3" },
      { command: 37, targetTextIDs: ["advchat_miku_01"], targetChatID: 1, advTextID: "m3b" },
      { command: 36, targetName: "advchat_miku_mother_nosound_01" },
    ], [
      text("advchat_mother_01", "妈妈"), text("advchat_miku_01", "心玖"),
      text("m1", "有好好吃饭吗？"), text("m1b", "有好好吃饭吗？"), text("m2", "有的"), text("m3", "谢谢妈妈"), text("m3b", "谢谢妈妈"),
    ], { chatIcons: { 1: "adv_data_miku_chaticon", 2: "adv_data_mother_chaticon" } });

    expect(script.lines.map((line) => [line.kind, line.speaker, line.text, line.chat?.thread, line.chat?.title, line.chat?.outgoing])).toEqual([
      ["chat", "妈妈", "有好好吃饭吗？", 1, "妈妈", false],
      ["chat", "心玖", "有的", 2, "妈妈", true],
      ["chat", "心玖", "谢谢妈妈", 2, "妈妈", true],
    ]);
    expect(script.lines[0]!.chat?.iconUrl).toBe(`${assetConfig.api}/zh-Hans/Adv/Chat/Icon/adv_data_mother_chaticon/adv_data_mother_chaticon.webp`);
    expect(script.lines[2]!.chat?.iconUrl).toBe(script.lines[1]!.chat?.iconUrl);
  });

  test("stills toggle, carry captions and repeat only after a background change; backgrounds show once spoken over, blank ones as breaks", () => {
    const script = parse([
      { command: 25, targetAssetName: "adv_bkg_stage_000218/adv_bkg_stage_000218" },
      { command: 25, targetAssetName: "adv_bkg_stage_000199/adv_bkg_stage_000199" },
      { command: 2, advTextID: "a" },
      { command: 30, targetAssetName: "anime/adv_still_anime_000007/adv_still_anime_000007" },
      { command: 30, targetAssetName: "anime/adv_still_anime_000007/adv_still_anime_000007" },
      { command: 25, targetAssetName: "adv_bkg_stage_000199/adv_bkg_stage_000199" },
      { command: 20, advTextID: "b" },
      { command: 30, targetAssetName: "anime/adv_still_anime_000007/adv_still_anime_000007" },
      { command: 30, targetAssetName: "anime/adv_still_anime_000007/adv_still_anime_000007" },
      { command: 25, targetAssetName: "adv_bkg_stage_000150/adv_bkg_stage_000150" },
      { command: 20, advTextID: "c" },
      { command: 30, targetAssetName: "anime/adv_still_anime_000007/adv_still_anime_000007" },
      { command: 25, targetAssetName: "adv_bkg_stage_000218/adv_bkg_stage_000218" },
      { command: 20, advTextID: "d" },
      { command: 25, targetAssetName: "adv_bkg_stage_000150/adv_bkg_stage_000150" },
      { command: 2, advTextID: "e" },
    ], [text("a", "甲"), text("b", "乙"), text("c", "丙"), text("d", "丁"), text("e", "戊")], {
      stillCaptions: [{ assetName: "anime/adv_still_anime_000007/adv_still_anime_000007", open: 3, close: 4, text: "通知中心" }],
    });

    const stage = (id: string) => `${assetConfig.api}/zh-Hans/Adv/Stage/adv_bkg_stage_${id}/data/adv_bkg_stage_${id}/adv_bkg_stage_${id}.webp`;
    const still = `${assetConfig.api}/zh-Hans/Adv/Still/anime/adv_still_anime_000007/data/adv_still_anime_000007/adv_still_anime_000007.webp`;
    expect(script.timeline).toEqual([
      { kind: "background", url: stage("000199") },
      { kind: "line", line: 0 },
      { kind: "still", url: still, caption: "通知中心" },
      { kind: "line", line: 1 },
      // A time/place card spoken first over a background names the scene.
      { kind: "background", url: stage("000150"), name: "丙" },
      { kind: "line", line: 2 },
      { kind: "still", url: still },
      // A black or white screen is a scene break; the scene after one shows its background again.
      { kind: "blank" },
      { kind: "line", line: 3 },
      { kind: "background", url: stage("000150") },
      { kind: "line", line: 4 },
    ]);
    expect(script.lines.map((line) => line.kind)).toEqual(["dialogue", "telop", "telop", "telop", "dialogue"]);
  });

  test("clip lines are timed by the blocking rows between them", () => {
    const script = parse([
      { command: 27, videoID: 41 },
      { command: 6, duration: 0.5 },
      { command: 7, duration: 3, isNoWait: true },
      { command: 3, duration: 2.2 },
      { command: 28, targetName: "raika", advTextID: "t1", isNoWait: true },
      { command: 3, duration: 5 },
      { command: 28, targetName: "raika", advTextID: "t2", isNoWait: true },
      { command: 3, duration: 1.5 },
      { command: 28, isNoWait: true },
      { command: 3, duration: 4 },
      { command: 28, targetName: "raika", advTextID: "t3", isNoWait: true },
      { command: 3, duration: 2 },
      { command: 27, parameter3: "SkipClipTarget" },
    ], [text("t1", "一"), text("t2", "二"), text("t3", "三")], {
      video: [{ id: 41, assetName: "adv/adv_movie_a/adv_movie_a", width: 1920, height: 1080, note: "" }],
    });

    expect(script.lines.map((line) => line.cue)).toEqual([
      { start: 2.7, end: 7.7 },
      { start: 7.7, end: 9.2 },
      { start: 13.2, end: 15.2 },
    ]);
  });

  test("rich text keeps size, emphasis and furigana as runs and leaves plain text", () => {
    const script = parse([
      { command: 2, targetName: "nonoka", advTextID: "t1" },
      { command: 2, targetName: "nonoka", advTextID: "t2" },
      { command: 2, targetName: "nonoka", advTextID: "t3" },
    ], [
      text("t1", "小<size=110%>～<size=150%>由</size>乃"),
      text("t2", "<align=\"center\"><color=#EEEEEE>お<r=と>義</r>父<br><b>さん</b></color>"),
      text("t3", "<i dont know> <3"),
    ]);

    expect(script.lines.map((line) => [line.text, line.rich])).toEqual([
      ["小～由乃", [{ text: "小" }, { text: "～", scale: 1.1 }, { text: "由", scale: 1.5 }, { text: "乃", scale: 1.1 }]],
      ["お義父\nさん", [{ text: "お" }, { text: "義", ruby: "と" }, { text: "父\n" }, { text: "さん", bold: true }]],
      ["<i dont know> <3", undefined],
    ]);
  });

  test("a message sent just before its window opens joins that window", () => {
    const script = parse([
      { command: 37, targetTextIDs: ["advchat_mother_01"], targetChatID: 2, advTextID: "m1" },
      { command: 36, targetName: "advchat_miku_mother_nosound_01", targetTextIDs: ["advchat_mother_01"], targetChatID: 1 },
      { command: 36, targetName: "advchat_miku_mother_nosound_01" },
      { command: 37, targetTextIDs: ["advchat_mother_01"], targetChatID: 2, advTextID: "m2" },
    ], [text("advchat_mother_01", "妈妈"), text("m1", "在忙吗？"), text("m2", "回个信吧")], {
      chatIcons: { 1: "adv_data_miku_chaticon", 2: "adv_data_mother_chaticon" },
    });

    expect(script.lines.map((line) => [line.chat?.thread, line.chat?.title, line.chat?.outgoing])).toEqual([
      [1, "妈妈", false],
      [2, "", false],
    ]);
  });

  test("dialogue target status 1 masks the speaker (？？？) and 2 hides the name; other commands are untouched", () => {
    const script = parse([
      { command: 2, targetName: "taki", targetTextIDs: ["adv_taki"], advTextID: "t1", targetStatus: 1 },
      { command: 2, targetName: "sakiko", targetTextIDs: ["adv_sakiko"], advTextID: "t2", targetStatus: 2 },
      { command: 2, targetName: "tomori", targetTextIDs: ["adv_tomori"], advTextID: "t3" },
      { command: 20, advTextID: "t4", targetStatus: 1 },
    ], [text("adv_taki", "立希"), text("adv_sakiko", "祥子"), text("adv_tomori", "燈"), text("t1", "――燈！"), text("t2", "初華へ"), text("t3", "うん"), text("t4", "翌朝")]);

    expect(script.lines.map((line) => [line.speaker, line.speakerStatus])).toEqual([
      ["立希", 1],
      ["祥子", 2],
      ["燈", undefined],
      // A time/place card is not a dialogue, so its status is dropped.
      ["", undefined],
    ]);
  });
});

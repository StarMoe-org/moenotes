import { expect, test } from "bun:test";
import { gameUiSources } from "../src/config/game-ui";
const defaults = { tw: "/ui/tw/manifest.json", jp: "/ui/jp/manifest.json" };

test("international servers share one source identity while JP uses its own export", () => {
  const config = gameUiSources({}, defaults);
  expect(config.libraries.kr).toBe(config.libraries.tw);
  expect(config.libraries.en).toBe(config.libraries.tw);
  expect(config.libraries.jp).not.toBe(config.libraries.tw);
  expect(config.regions).toEqual({ tw: "tw", jp: "jp", kr: "tw", en: "tw" });
});

test("regional overrides keep strict source identity and explicit disabling", () => {
  const config = gameUiSources({ tw: "https://example.com/tw.json", kr: "https://example.com/kr.json", jp: "", en: "" }, defaults);
  expect(config.libraries.kr).toBe("https://example.com/kr.json");
  expect(config.regions.kr).toBe("kr");
  expect(config.libraries.jp).toBe("");
  expect(config.libraries.en).toBe("");
  expect(gameUiSources({ tw: "" }, defaults).libraries).toEqual({ tw: "", jp: defaults.jp, kr: "", en: "" });
});

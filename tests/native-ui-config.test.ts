import { expect, test } from "bun:test";
import { gameUiSources } from "../src/config/game-ui";
import { buildPublicEnv } from "../src/config/public-env";
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

test("an unset public source keeps its module default in the browser bundle", () => {
  const env = buildPublicEnv({}, { version: "0.2.0", revision: "abc" });
  // Absent, not "": gameUiSources reads undefined as "use the published default" and "" as "disabled".
  expect("PUBLIC_GAME_UI_LIBRARY_TW" in env).toBe(false);
  expect(env.PUBLIC_MOENOTES_VERSION).toBe("0.2.0");
  expect(env.PUBLIC_MOENOTES_REVISION).toBe("abc");
  expect(gameUiSources({ tw: env.PUBLIC_GAME_UI_LIBRARY_TW }, defaults).libraries.tw).toBe(defaults.tw);
});

test("an explicitly empty public source stays empty so it still disables the source", () => {
  const env = buildPublicEnv({ PUBLIC_GAME_UI_LIBRARY_TW: "", PUBLIC_DECK_RECOMMEND_ENGINE: "" }, { version: "0.2.0", revision: "abc" });
  expect(env.PUBLIC_GAME_UI_LIBRARY_TW).toBe("");
  expect(env.PUBLIC_DECK_RECOMMEND_ENGINE).toBe("");
  expect(gameUiSources({ tw: env.PUBLIC_GAME_UI_LIBRARY_TW }, defaults).libraries.tw).toBe("");
});

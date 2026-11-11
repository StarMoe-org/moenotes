import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Md3Provider } from "../src/components/md3/Md3Provider";
import { ContentSettings } from "../src/components/shell/SettingsDrawer";
import SpoilerNotice from "../src/components/shared/SpoilerNotice";
import { t } from "../src/i18n";
import { buildThemeBootstrapScript } from "../src/lib/settings/apply-theme";
import { getShowSpoiler, isSpoilerUnlocked, setShowSpoiler } from "../src/lib/settings/spoiler";

const CORE_LOCALES = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const;
const SHOW_SPOILER_KEY = "moenotes:show-spoiler";

const originalLocalStorage = globalThis.localStorage;

function installMockStorage(initial = new Map<string, string>()) {
  const store = new Map(initial);
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  return store;
}

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: originalLocalStorage, configurable: true, writable: true });
});

describe("public spoiler controls", () => {
  test("stays locked and ignores a stored showSpoiler preference", () => {
    const store = installMockStorage(new Map([[SHOW_SPOILER_KEY, "1"]]));

    expect(isSpoilerUnlocked()).toBe(false);
    expect(getShowSpoiler()).toBe(false);

    setShowSpoiler(true);
    expect(getShowSpoiler()).toBe(false);
    expect(store.get(SHOW_SPOILER_KEY)).toBe("1");
  });

  test("the early theme bootstrap no longer recognizes a spoiler-override URL", () => {
    const script = buildThemeBootstrapScript().toLowerCase();
    expect(script).not.toContain("spoiler=allow");
    expect(script).not.toContain("moenotes:show-spoiler");
  });

  test("does not render a spoiler switch in ContentSettings across the five core locales", () => {
    for (const locale of CORE_LOCALES) {
      const html = renderToStaticMarkup(
        <Md3Provider>
          <ContentSettings locale={locale} />
        </Md3Provider>,
      );
      expect(html).not.toContain(t(locale, "settings.spoiler.title"));
      expect(html).not.toContain(t(locale, "settings.spoiler.showLabel"));
      expect(html).not.toContain(t(locale, "settings.spoiler.devOptionBadge"));
      expect(html).not.toContain(t(locale, "settings.spoiler.devOnly"));
      // Only the Japanese song-title switch remains.
      expect((html.match(/type="checkbox"/g) ?? []).length).toBe(1);
    }
  });

  test("renders the unreleased-content notice across the five core locales", () => {
    for (const locale of CORE_LOCALES) {
      const html = renderToStaticMarkup(
        <Md3Provider>
          <SpoilerNotice locale={locale} />
        </Md3Provider>,
      );
      expect(html).not.toContain("settings.spoiler.");
      expect(html).toContain(t(locale, "settings.spoiler.restrictedTitle"));
      expect(html).toContain(t(locale, "settings.spoiler.eulaNotice"));
    }
  });
});

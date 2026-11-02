import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Md3Provider } from "../src/components/md3/Md3Provider";
import { ContentSettings } from "../src/components/shell/SettingsDrawer";
import { storageKeys } from "../src/config/storage";
import { t } from "../src/i18n";
import {
  SPOILER_PREFERENCE_EVENT,
  checkSpoilerUrlParam,
  getShowSpoiler,
  isSpoilerUnlocked,
  setShowSpoiler,
} from "../src/lib/settings/spoiler";

const CORE_LOCALES = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const;

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

function installMockWindow(search = "") {
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  } as unknown as Storage;

  const mockWindow = {
    location: { search },
    localStorage: mockStorage,
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: Event) => {
      for (const fn of listeners.get(event.type) ?? []) fn(event);
      return true;
    },
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", { value: mockWindow, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, configurable: true, writable: true });
  return { store, listeners };
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true, writable: true });
  Object.defineProperty(globalThis, "localStorage", { value: originalLocalStorage, configurable: true, writable: true });
});

describe("Spoiler setting unlocked developer option", () => {
  test("allows toggling showSpoiler on and off directly without requiring a backdoor unlock", () => {
    const { store } = installMockWindow();
    const events: Array<{ showSpoiler: boolean; isUnlocked: boolean }> = [];
    window.addEventListener(SPOILER_PREFERENCE_EVENT, (ev: Event) => {
      events.push((ev as CustomEvent<{ showSpoiler: boolean; isUnlocked: boolean }>).detail);
    });

    expect(isSpoilerUnlocked()).toBe(true);
    expect(getShowSpoiler()).toBe(false);
    expect(store.get(storageKeys.spoilerUnlocked)).toBeUndefined();

    setShowSpoiler(true);
    expect(getShowSpoiler()).toBe(true);
    expect(store.get(storageKeys.showSpoiler)).toBe("1");

    setShowSpoiler(false);
    expect(getShowSpoiler()).toBe(false);
    expect(store.get(storageKeys.showSpoiler)).toBe("0");

    expect(events).toEqual([
      { showSpoiler: true, isUnlocked: true },
      { showSpoiler: false, isUnlocked: true },
    ]);
  });

  test("preserves ?Spoiler=allow and ?Spoiler=disallow URL convenience while still allowing manual changes", () => {
    installMockWindow("?Spoiler=allow");
    expect(checkSpoilerUrlParam()).toBe(true);
    expect(getShowSpoiler()).toBe(true);

    setShowSpoiler(false);
    expect(getShowSpoiler()).toBe(false);

    installMockWindow("?spoiler=disallow");
    expect(checkSpoilerUrlParam()).toBe(false);
    expect(getShowSpoiler()).toBe(false);
    // Manual toggle still works even when URL previously carried ?spoiler=disallow
    setShowSpoiler(true);
    expect(getShowSpoiler()).toBe(true);
  });

  test("renders an interactive Switch without a lock icon while keeping developer option badges across 5 locales", () => {
    for (const locale of CORE_LOCALES) {
      const html = renderToStaticMarkup(
        <Md3Provider>
          <ContentSettings locale={locale} />
        </Md3Provider>,
      );
      expect(html).toContain(t(locale, "settings.spoiler.title"));
      expect(html).toContain(t(locale, "settings.spoiler.showLabel"));
      expect(html).toContain(t(locale, "settings.spoiler.description"));
      expect(html).toContain(t(locale, "settings.spoiler.devOptionBadge"));
      expect(html).toContain(t(locale, "settings.spoiler.devOnly"));
      // Must NOT render the locked state label in Settings
      expect(html).not.toContain(`aria-label="${t(locale, "settings.spoiler.restrictedTitle")}"`);
      // Two switches in ContentSettings: Japanese song titles + Spoiler display
      expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    }
  });
});

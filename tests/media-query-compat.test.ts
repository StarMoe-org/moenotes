import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { buildMediaQueryCompatScript } from "../src/lib/browser/media-query-compat";

type Listener = (this: LegacyMedia, event: { matches: boolean; media: string }) => void;

/** No MediaQueryList global/prototype: some WebViews expose only the returned objects. */
class LegacyMedia {
  matches = false;
  listeners = new Set<Listener>();
  constructor(readonly media: string) {}
  addListener(listener: Listener) { this.listeners.add(listener); }
  removeListener(listener: Listener) { this.listeners.delete(listener); }
  change(matches: boolean) {
    this.matches = matches;
    for (const listener of this.listeners) listener.call(this, { matches, media: this.media });
  }
}

type BridgedMedia = LegacyMedia & {
  addEventListener: (type: string, listener: Listener) => void;
  removeEventListener: (type: string, listener: Listener) => void;
};

function legacyWindow() {
  const media: LegacyMedia[] = [];
  const window = {
    matchMedia(this: unknown, query: string): LegacyMedia {
      expect(this).toBe(window);
      const result = new LegacyMedia(query);
      media.push(result);
      return result;
    },
  };
  return { window, media };
}

const script = buildMediaQueryCompatScript();

describe("media-query compatibility before hydration", () => {
  test("the inline bootstrap is valid ES5, independent of the application's bundle target", () => {
    expect(() => new Function(script)).not.toThrow();
    expect(script).not.toMatch(/=>|`|\.\.\.|\b(?:let|const|class)\s/);
  });

  test("modern browsers keep their native matchMedia and event methods", () => {
    const addEventListener = () => {};
    const removeEventListener = () => {};
    const result = { addEventListener, removeEventListener };
    const window = { matchMedia: () => result };
    const native = window.matchMedia;
    runInNewContext(script, { window });
    expect(window.matchMedia).toBe(native);
    expect(window.matchMedia().addEventListener).toBe(addEventListener);
    expect(window.matchMedia().removeEventListener).toBe(removeEventListener);
  });

  test("legacy change listeners get live updates and can unsubscribe", () => {
    const { window, media } = legacyWindow();
    runInNewContext(script, { window });
    const query = window.matchMedia("(prefers-color-scheme: dark)") as BridgedMedia;
    expect(query).toBe(media.at(-1)!);
    const changes: boolean[] = [];
    const listener: Listener = function(event) {
      expect(this).toBe(query);
      expect(event.media).toBe("(prefers-color-scheme: dark)");
      changes.push(event.matches);
    };
    query.addEventListener("change", listener);
    query.change(true);
    expect(query.matches).toBe(true);
    query.change(false);
    query.removeEventListener("change", listener);
    query.change(true);
    expect(changes).toEqual([true, false]);
    expect(query.listeners.size).toBe(0);
  });

  test("separate media queries do not share subscriptions; other event types are ignored", () => {
    const { window } = legacyWindow();
    runInNewContext(script, { window });
    const narrow = window.matchMedia("(max-width: 767px)") as BridgedMedia;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)") as BridgedMedia;
    const changes: string[] = [];
    const listener = () => { changes.push("narrow"); };
    narrow.addEventListener("change", listener);
    narrow.addEventListener("click", listener);
    narrow.removeEventListener("click", listener);
    reduce.addEventListener("change", () => { changes.push("reduce"); });
    reduce.change(true);
    narrow.change(true);
    expect(changes).toEqual(["reduce", "narrow"]);
    expect(narrow.listeners.size).toBe(1);
  });

  test("does not replace a native method on partially upgraded implementations", () => {
    const nativeAdd = () => {};
    const result = Object.assign(new LegacyMedia("all"), { addEventListener: nativeAdd });
    const window = { matchMedia: () => result };
    runInNewContext(script, { window });
    const query = window.matchMedia() as BridgedMedia;
    expect(query.addEventListener).toBe(nativeAdd);
    expect(typeof query.removeEventListener).toBe("function");
  });

  test("running the bootstrap again does not wrap matchMedia or duplicate subscriptions", () => {
    const { window } = legacyWindow();
    runInNewContext(script, { window });
    const wrapped = window.matchMedia;
    runInNewContext(script, { window });
    expect(window.matchMedia).toBe(wrapped);
  });

  test("missing matchMedia is not made into a broken or invented implementation", () => {
    const window = {};
    expect(() => runInNewContext(script, { window })).not.toThrow();
    expect(window).not.toHaveProperty("matchMedia");
  });

  test("every page installs the bridge inline before theme bootstrapping and island markup", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const tagIndex = (variable: string) => {
      const match = new RegExp(`<script[^>]*dangerouslySetInnerHTML=\\{\\{\\s*__html:\\s*${variable}\\s*\\}\\}`).exec(layout);
      return match?.index ?? -1;
    };
    const compat = tagIndex("mediaQueryCompatScript");
    const theme = tagIndex("themeScript");
    const content = layout.indexOf("{children}");
    expect(compat).toBeGreaterThan(layout.indexOf("<head>"));
    expect(compat).toBeLessThan(theme);
    expect(theme).toBeLessThan(content);
  });
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { storageKeys } from "../src/config/storage";
import { accentCache, ACCENT_CACHE_VERSION } from "../src/lib/settings/accent";
import { buildNavGroupBootstrapScript, buildSidebarScrollBootstrapScript, buildThemeBootstrapScript } from "../src/lib/settings/apply-theme";
import { contrastRatio, MD3_ROLES, roleToKebab } from "../src/lib/md3/roles";
import { MD3_DEFAULT_SEED, md3Schemes } from "../src/lib/md3/scheme";
import { buildMd3ColorsCss } from "../src/lib/md3/tokens-css";
import { normalizeSettings, parseSettingsJson } from "../src/lib/settings/schema";

describe("settings", () => {
  test("settings stored by an older version read with defaults for the new fields", () => {
    expect(parseSettingsJson(JSON.stringify({ locale: "ja-JP", colorScheme: "dark", gameServer: "jp" }))).toEqual({
      locale: "ja-JP", colorScheme: "dark", gameServer: "jp", accentColor: "default", density: "comfortable",
    });
  });

  test("accent colors and density are checked", () => {
    expect(normalizeSettings({ accentColor: "#3388bb", density: "compact" })).toMatchObject({ accentColor: "#3388BB", density: "compact" });
    expect(normalizeSettings({ accentColor: "red", density: "tiny" })).toMatchObject({ accentColor: "default", density: "comfortable" });
    expect(normalizeSettings({ accentColor: "#38b" })).toMatchObject({ accentColor: "default" });
  });
});

describe("material 3 schemes from band colors", () => {
  // MasterBand.mainColorCode of the five bands (TW, 2026-10), the default seed, plus a very light and a very dark color.
  const seeds = [MD3_DEFAULT_SEED, "#3388BB", "#881144", "#FF7788", "#AA22EE", "#FFAA33", "#FFFF00", "#101010"];
  // Content / container pairs that carry text: M3 guarantees 4.5:1 for each at standard contrast.
  const textPairs = [
    ["onPrimary", "primary"],
    ["onPrimaryContainer", "primaryContainer"],
    ["onSecondaryContainer", "secondaryContainer"],
    ["onTertiaryContainer", "tertiaryContainer"],
    ["onErrorContainer", "errorContainer"],
    ["onSurface", "surface"],
    ["onSurface", "surfaceContainerHighest"],
    ["onSurfaceVariant", "surfaceContainerHighest"],
    ["inverseOnSurface", "inverseSurface"],
    ["onSuccessContainer", "successContainer"],
    ["onWarningContainer", "warningContainer"],
    ["onCategory1Container", "category1Container"],
    ["onCategory5Container", "category5Container"],
    ["primary", "surfaceContainerLow"],
    ["error", "surface"],
    ["success", "surface"],
  ] as const;

  test("every scheme carries every role as a hex color", () => {
    for (const seed of seeds) {
      const schemes = md3Schemes(seed)!;
      for (const theme of ["light", "dark"] as const) {
        for (const role of MD3_ROLES) expect(schemes[theme][role]).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  test("text stays readable on its container in both themes", () => {
    for (const seed of seeds) {
      const schemes = md3Schemes(seed)!;
      for (const theme of ["light", "dark"] as const) {
        const colors = schemes[theme];
        for (const [content, container] of textPairs) {
          expect(contrastRatio(colors[content]!, colors[container]!)).toBeGreaterThanOrEqual(4.5);
        }
        // Outlines of controls and focus indicators: 3:1 against the surface.
        expect(contrastRatio(colors.outline!, colors.surface!)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("rejects what is not a color", () => {
    expect(md3Schemes("default")).toBeNull();
    expect(md3Schemes("#12345")).toBeNull();
    expect(accentCache("red")).toBeNull();
  });

  test("the cache the bootstrap script reads carries its version and both schemes", () => {
    const cache = accentCache("#3388BB")!;
    expect(cache.version).toBe(ACCENT_CACHE_VERSION);
    expect(cache.color).toBe("#3388BB");
    expect(cache.light.primary).not.toBe(cache.dark.primary);
    const script = buildThemeBootstrapScript();
    expect(script).toContain(`cached.version === ${ACCENT_CACHE_VERSION}`);
    for (const role of MD3_ROLES) expect(script).toContain(`"${role}"`);
    expect(() => new Function(script)).not.toThrow();
  });

  test("the committed default scheme stylesheet is the generator's output", () => {
    const committed = readFileSync(new URL("../src/styles/md3/colors.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(buildMd3ColorsCss());
    for (const role of MD3_ROLES) expect(committed).toContain(`--md-sys-color-${roleToKebab(role)}:`);
  });
});

describe("navigation group folds are applied before the first paint", () => {
  interface FakeStyle {
    id: string;
    textContent: string;
    parentNode: unknown;
  }

  function runBootstrap(stored: string | null, activeGroupId?: string, previousGroupId: string | null = null) {
    const dataset: Record<string, string> = {};
    let style: FakeStyle | null = null;
    let timer: (() => void) | null = null;
    const head = {
      appendChild(node: FakeStyle) {
        node.parentNode = head;
        style = node;
      },
      removeChild(node: FakeStyle) {
        if (style === node) style = null;
      },
    };
    const fakeDocument = {
      documentElement: { dataset },
      head,
      createElement: (): FakeStyle => ({ id: "", textContent: "", parentNode: null }),
      getElementById: (id: string) => (style && style.id === id ? style : null),
    };
    runInNewContext(buildNavGroupBootstrapScript(activeGroupId), {
      localStorage: { getItem: (key: string) => (key === storageKeys.navGroups ? stored : null) },
      sessionStorage: { getItem: (key: string) => (key === storageKeys.navActiveGroup ? previousGroupId : null) },
      document: fakeDocument,
      setTimeout: (callback: () => void) => {
        timer = callback;
        return 1;
      },
    });
    return { dataset, style: () => style, fireTimeout: () => timer?.() };
  }

  test("a folded group's body is hidden and its chevron points down before the first paint", () => {
    const drawer = runBootstrap(JSON.stringify({ database: true, musics: false }));
    expect(drawer.dataset.navGroups).toBe("pending");
    expect(drawer.style()?.textContent).toContain("#nav-group-database{display:none!important}");
    expect(drawer.style()?.textContent).toContain('[data-nav-chevron="database"] svg{rotate:0deg!important}');
    expect(drawer.style()?.textContent).not.toContain("nav-group-musics");
    // The fallback for a bundle that never hydrates shows the expanded markup again.
    drawer.fireTimeout();
    expect(drawer.style()).toBeNull();
    expect(drawer.dataset.navGroups).toBeUndefined();
  });

  test("the group entered from outside stays open, so the first paint already matches the entry rule", () => {
    const entering = runBootstrap(JSON.stringify({ database: true, tools: true }), "database", null);
    expect(entering.style()?.textContent).not.toContain("nav-group-database");
    expect(entering.style()?.textContent).toContain("nav-group-tools");

    const sameGroup = runBootstrap(JSON.stringify({ database: true }), "database", "database");
    expect(sameGroup.style()?.textContent).toContain("nav-group-database");
  });

  test("nothing folded leaves the server markup untouched", () => {
    for (const stored of [null, "", "not json", "[]", JSON.stringify({ database: false }), JSON.stringify({ tools: "true" })]) {
      const result = runBootstrap(stored, "database", null);
      expect(result.style()).toBeNull();
      expect(result.dataset.navGroups).toBeUndefined();
    }
    // Entering the only folded group opens it, so there is nothing to hide.
    const onlyEntering = runBootstrap(JSON.stringify({ database: true }), "database", null);
    expect(onlyEntering.style()).toBeNull();
    expect(onlyEntering.dataset.navGroups).toBeUndefined();
  });

  test("foreign ids and non-boolean values are ignored", () => {
    const result = runBootstrap('{"bad id":true,"__proto__":true,"tools":"true"}');
    expect(result.style()).toBeNull();
    expect(result.dataset.navGroups).toBeUndefined();
  });

  test("the stored folds hide only their group bodies, never the drawer", () => {
    const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
    expect(css).not.toContain('data-nav-groups="pending"] .mn-desktop-sidebar');
  });

  test("the script is valid JavaScript", () => {
    expect(() => new Function(buildNavGroupBootstrapScript())).not.toThrow();
    expect(buildNavGroupBootstrapScript()).toContain(JSON.stringify(storageKeys.navGroups));
    expect(buildNavGroupBootstrapScript("database")).toContain('"database"');
  });
});

describe("the drawer's scroll offset is restored before hydration", () => {
  function runScrollBootstrap(saved: string | null, nav: { scrollTop: number } | null) {
    runInNewContext(buildSidebarScrollBootstrapScript(), {
      sessionStorage: { getItem: (key: string) => (key === storageKeys.sidebarScroll ? saved : null) },
      document: { querySelector: () => nav },
    });
  }

  test("a stored offset is applied to the drawer's list", () => {
    const nav = { scrollTop: 0 };
    runScrollBootstrap("300", nav);
    expect(nav.scrollTop).toBe(300);
  });

  test("missing, unusable or non-positive offsets leave the list alone", () => {
    for (const saved of [null, "", "not a number", "0", "-20"]) {
      const nav = { scrollTop: 42 };
      runScrollBootstrap(saved, nav);
      expect(nav.scrollTop).toBe(42);
    }
    expect(() => runScrollBootstrap("300", null)).not.toThrow();
  });

  test("the script is valid JavaScript and targets the drawer's list", () => {
    expect(() => new Function(buildSidebarScrollBootstrapScript())).not.toThrow();
    expect(buildSidebarScrollBootstrapScript()).toContain(JSON.stringify(storageKeys.sidebarScroll));
    expect(buildSidebarScrollBootstrapScript()).toContain("nav[data-sidebar-nav]");
  });
});

describe("critical inline scripts opt out of Rocket Loader", () => {
  // Rocket Loader rewrites and defers every inline script unless the tag opts out, which turns the pre-paint theme,
  // fold and scroll setup into a visible flip after the server markup has already painted.
  test("theme, navigation and drawer scroll scripts stay synchronous", () => {
    const files: Array<[string, string[]]> = [
      ["../src/app/layout.tsx", ["mediaQueryCompatScript", "themeScript", "navGroupScript", "accountScript", "filterScript"]],
      ["../src/components/shell/AppShellClient.tsx", ["sidebarScrollScript"]],
    ];
    for (const [path, variables] of files) {
      const lines = readFileSync(new URL(path, import.meta.url), "utf8").split("\n");
      for (const variable of variables) {
        const tag = lines.find((line) => line.includes(`__html: ${variable}`));
        expect(tag).toBeDefined();
        expect(tag).toContain('data-cfasync="false"');
      }
    }
  });
});

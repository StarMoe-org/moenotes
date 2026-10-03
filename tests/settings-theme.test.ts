import { describe, expect, test } from "bun:test";
import { accentPalettes, contrastRatio } from "../src/lib/settings/accent";
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

describe("band accent palettes", () => {
  // MasterBand.mainColorCode of the five bands (TW, 2026-10), plus a very light and a very dark color.
  const colors = ["#3388BB", "#881144", "#FF7788", "#AA22EE", "#FFAA33", "#FFFF00", "#101010"];
  const paper = { light: "#f7faff", dark: "#101b31" } as const;

  test("text and filled buttons stay readable on both themes", () => {
    for (const color of colors) {
      const palettes = accentPalettes(color)!;
      for (const theme of ["light", "dark"] as const) {
        const palette = palettes[theme];
        expect(contrastRatio(palette.deep, paper[theme])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(palette.accent, paper[theme])).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(palette.deep, palette.soft)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("rejects what is not a color", () => {
    expect(accentPalettes("default")).toBeNull();
    expect(accentPalettes("#12345")).toBeNull();
  });
});

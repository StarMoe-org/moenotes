import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const drawer = readFileSync("src/components/shell/filter-drawer/FilterDrawer.tsx", "utf8");
const css = readFileSync("src/styles/global.css", "utf8");

describe("the docked filter sheet keeps a steady position animation", () => {
  test("it enters with a CSS animation instead of MUI Slide's mount-appear path", () => {
    // Slide mounted the sheet off-screen and flipped it to `none` in one style update on client navigation, so the
    // entrance was sometimes instant and sometimes the full slide.
    expect(drawer).not.toContain('from "@mui/material/Slide"');
    expect(drawer).toContain("data-open={shouldShow}");
    expect(drawer).toContain("mn-filter-sheet");
    expect(css).toMatch(/@keyframes mn-filter-sheet-in/);
    expect(css).toMatch(/\.mn-filter-sheet\[data-open="true"\] \{[^}]*animation: mn-filter-sheet-in/s);
  });

  test("it fades and slides out again, with left following the navigation drawer", () => {
    expect(css).toMatch(/\.mn-filter-sheet \{[^}]*visibility: hidden/s);
    expect(css).toMatch(/\.mn-filter-sheet \{[^}]*left var\(--md-sys-motion-duration-medium2\)/s);
    expect(css).toMatch(/\.mn-filter-sheet \{[^}]*transform var\(--md-sys-motion-duration-medium2\)/s);
  });
});

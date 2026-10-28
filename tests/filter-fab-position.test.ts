import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles/global.css", "utf8");
const sidebar = readFileSync("src/components/shell/Sidebar.tsx", "utf8");
const shell = readFileSync("src/components/shell/AppShell.astro", "utf8");
const handle = readFileSync("src/components/shell/filter-drawer/FilterTabHandle.tsx", "utf8");

/** Tailwind's `md`, which the drawer's `md:block` and the content's `md:pl-*` both use (default 48rem). */
const md = /--breakpoint-md:\s*([^;]+);/.exec(css)?.[1]?.trim() ?? "48rem";

describe("the filter button keeps clear of the docked navigation drawer", () => {
  test("it moves to the content column from the width the drawer docks at", () => {
    // Both start at `md`: the drawer is hidden below it (global.css) and the content padded for it from it (AppShell).
    expect(css).toMatch(/@media \(width < 48rem\) \{\s*\.mn-desktop-sidebar \{/);
    expect(shell).toContain("md:pl-[calc(var(--mn-sidebar-offset,17rem)+var(--mn-filter-offset,0rem)+1.5rem)]");
    // A wider breakpoint (the old 1024px) left the button over the drawer between the two widths, on windows
    // that are wide enough for the drawer but still portrait-ish.
    const rule = /@media \(min-width: ([^)]+)\) \{\s*\.mn-filter-fab \{/.exec(css);
    expect(rule?.[1]).toBe(md);
  });

  test("it stays at the window's edge below md, where no drawer takes room", () => {
    expect(css).toMatch(/\.mn-filter-fab \{\s*left: 1rem;/);
  });

  test("its docked offset clears the drawer's rail and the content's gutter", () => {
    expect(css).toContain("max(var(--mn-sidebar-offset, 17rem), 0.75rem) + 1.5rem");
  });

  test("it slides with the drawer's own motion instead of jumping while the content reflows", () => {
    expect(css).toContain("left var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate)");
  });

  test("it paints beneath the drawer so it slides out from under the glass", () => {
    const z = (source: string, pattern: RegExp) => Number(pattern.exec(source)?.[1] ?? Number.NaN);
    const fab = z(handle, /mn-filter-fab[^"]*\bz-(\d+)/);
    const drawer = z(sidebar, /mn-desktop-sidebar[^"]*\bz-(\d+)/);
    expect(fab).toBeLessThan(drawer);
  });
});

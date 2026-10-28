import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles/global.css", "utf8");
const sidebar = readFileSync("src/components/shell/Sidebar.tsx", "utf8");
const topBar = readFileSync("src/components/shell/TopAppBar.tsx", "utf8");

describe("the shell crosses the md breakpoint with motion, not a pop", () => {
  test("the docked drawer fades and slides away below md instead of display:none", () => {
    expect(sidebar).not.toContain("md:block");
    // Mobile first: no range syntax, so older WebViews still hide the docked drawer on phones.
    expect(css).toMatch(/\.mn-desktop-sidebar \{[^}]*visibility: hidden/s);
    expect(css).toMatch(/@media \(min-width: 48rem\) \{\s*\.mn-desktop-sidebar \{/);
    expect(css).toContain("visibility 0s linear var(--md-sys-motion-duration-medium2)");
  });

  test("the app bar's trail row and the inline trail trade places through properties", () => {
    expect(topBar).not.toContain("md:hidden");
    expect(topBar).toContain("mn-app-bar-crumbs");
    expect(css).toMatch(/\.mn-app-bar-trail \{[^}]*height: 2\.5rem/s);
    expect(css).toMatch(/@media \(min-width: 48rem\) \{\s*\.mn-app-bar-trail \{[^}]*height: 0/s);
    expect(css).toMatch(/\.mn-app-bar-crumbs \{[^}]*grid-template-columns: 0fr/s);
    expect(css).toMatch(/@media \(min-width: 48rem\) \{[\s\S]*?\.mn-app-bar-crumbs \{[^}]*grid-template-columns: 1fr/);
  });

  test("the drawer's top follows the app bar's height change", () => {
    expect(css).toContain("top var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized)");
  });

  test("the wide search field and the compact icon trade places at lg through width, not display", () => {
    expect(topBar).not.toContain("lg:!hidden");
    expect(topBar).not.toContain("lg:!flex");
    expect(topBar).toContain("mn-top-search glass");
    expect(topBar).toContain("mn-top-search-compact");
    expect(css).toMatch(/\.mn-top-search \{\s*width: 0;/);
    expect(css).toContain("width: 18rem;");
    expect(css).toMatch(/\.mn-top-search-compact \{\s*width: 2\.5rem;/);
    expect(css).toMatch(/\.mn-top-search \{[^}]*transition:[^}]*width var\(--md-sys-motion-duration-medium2\)/s);
  });

  test("the collapsible top-bar pieces leave no flex gap behind", () => {
    expect(topBar).toContain("crumbs.length > 0 &&");
    expect(topBar).toContain("lg:gap-0");
    expect(css).toMatch(/\.mn-app-bar-crumbs \{[^}]*margin-left: -0\.25rem/s);
    expect(css).toMatch(/\.mn-top-search \{[^}]*margin-right: -0\.5rem/s);
  });
});

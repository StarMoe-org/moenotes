import { describe, expect, test } from "bun:test";
import { docsSectionPages, resolveDocsUrl } from "../src/lib/account/docs-url";

describe("independent documentation URLs", () => {
  const base = "https://docs.example.test/manual";
  test("rejects absent, invalid and unsafe deployment configuration", () => {
    for (const value of ["", "   ", "not-a-url", "javascript:alert(1)", "file:///tmp/docs", "https://user:password@example.test"]) {
      expect(resolveDocsUrl(value, "zh-CN")).toBeNull();
    }
  });
  test("preserves deployment base and strips accidental search/hash", () => {
    expect(resolveDocsUrl(`${base}?foo=bar#old`, "zh-CN")).toBe(`${base}/`);
    expect(resolveDocsUrl(`${base}/`, "ja-JP", "#profiles")).toBe(`${base}/ja/api/profiles.html`);
  });
  test("maps all existing five locales and falls back to English", () => {
    for (const [locale, prefix] of Object.entries({ "zh-CN": "", "zh-TW": "zh-tw/", "ja-JP": "ja/", "en-US": "en/", "ko-KR": "ko/", "fr-FR": "en/" })) {
      expect(resolveDocsUrl(base, locale)).toBe(`${base}/${prefix}`);
    }
  });
  test("maps every known section and safely falls back for unknown fragments", () => {
    for (const [section, page] of Object.entries(docsSectionPages)) {
      expect(resolveDocsUrl(base, "en-US", `#${section}`)).toBe(`${base}/en/${page}`);
    }
    for (const hash of ["#unknown", "#constructor", "#__proto__", "#//evil.test", "#../../admin"]) {
      expect(resolveDocsUrl(base, "en-US", hash)).toBe(`${base}/en/`);
    }
  });
});

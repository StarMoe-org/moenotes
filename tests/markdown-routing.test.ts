import { describe, expect, test } from "bun:test";
import { getBuildCards, getBuildEvents, getBuildMusic } from "@/lib/masterdata/build-data";
import {
  estimateMarkdownTokens,
  markdownAbsoluteUrl,
  markdownPathFor,
  parseMarkdownTarget,
  prefersMarkdownAccept,
} from "@/lib/markdown/negotiate";
import { renderLlmsTxt, renderMarkdownForPath } from "@/lib/markdown/render";

describe("Markdown content negotiation & path mapping", () => {
  test("prefersMarkdownAccept respects RFC quality weights", () => {
    expect(prefersMarkdownAccept("text/markdown")).toBe(true);
    expect(prefersMarkdownAccept("text/markdown;q=0.9, text/html;q=0.8")).toBe(true);
    expect(prefersMarkdownAccept("text/x-markdown, */*;q=0.1")).toBe(true);
    expect(prefersMarkdownAccept("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
    expect(prefersMarkdownAccept("text/html;q=1.0, text/markdown;q=0.8")).toBe(false);
    expect(prefersMarkdownAccept("text/markdown;q=0")).toBe(false);
    expect(prefersMarkdownAccept(null)).toBe(false);
    expect(prefersMarkdownAccept("")).toBe(false);
  });

  test("markdownPathFor and parseMarkdownTarget round-trip default and prefixed locales", () => {
    expect(markdownPathFor("/", "zh-CN")).toBe("/index.md");
    expect(markdownPathFor("/", "ja-JP")).toBe("/ja/index.md");
    expect(markdownPathFor("/cards", "zh-CN")).toBe("/cards.md");
    expect(markdownPathFor("/cards/1001", "ja-JP")).toBe("/ja/cards/1001.md");
    expect(markdownAbsoluteUrl("/events/4", "en-US")).toContain("/en/events/4.md");

    expect(parseMarkdownTarget("/index.md")).toEqual({ locale: "zh-CN", pathname: "/" });
    expect(parseMarkdownTarget("/ja/index.md")).toEqual({ locale: "ja-JP", pathname: "/" });
    expect(parseMarkdownTarget("/ja.md")).toEqual({ locale: "ja-JP", pathname: "/" });
    expect(parseMarkdownTarget("/cards/1001.md")).toEqual({ locale: "zh-CN", pathname: "/cards/1001" });
    expect(parseMarkdownTarget("/en/events/4.md")).toEqual({ locale: "en-US", pathname: "/events/4" });
  });

  test("estimateMarkdownTokens produces positive UTF-8 token estimate", () => {
    expect(estimateMarkdownTokens("# Hello Our Notes")).toBeGreaterThan(0);
    expect(estimateMarkdownTokens("BanG Dream! 我们的音符")).toBeGreaterThan(3);
  });
});

describe("Markdown document & llms.txt rendering", () => {
  test("renders Home, Catalog, and Detail routes with YAML frontmatter and structured Markdown", async () => {
    const homeDoc = await renderMarkdownForPath("/index.md");
    expect(homeDoc).not.toBeNull();
    expect(homeDoc!.markdown).toContain("---\n");
    expect(homeDoc!.markdown).toContain('locale: "zh-CN"');
    expect(homeDoc!.tokens).toBeGreaterThan(20);

    const cards = await getBuildCards("ja-JP");
    expect(cards.length).toBeGreaterThan(0);
    const firstCard = cards[0]!;
    const cardDoc = await renderMarkdownForPath(`/ja/cards/${firstCard.id}.md`);
    expect(cardDoc).not.toBeNull();
    expect(cardDoc!.markdown).toContain('locale: "ja-JP"');
    expect(cardDoc!.markdown).toContain(`/ja/cards/${firstCard.id}`);
    expect(cardDoc!.markdownUrl).toEndWith(`/ja/cards/${firstCard.id}.md`);

    const events = await getBuildEvents("zh-CN");
    if (events.length > 0) {
      const eventDoc = await renderMarkdownForPath(`/events/${events[0]!.id}.md`);
      expect(eventDoc).not.toBeNull();
      expect(eventDoc!.markdown).toContain(`data_version:`);
    }

    const songs = await getBuildMusic("en-US");
    if (songs.length > 0) {
      const songDoc = await renderMarkdownForPath(`/en/music/${songs[0]!.id}.md`);
      expect(songDoc).not.toBeNull();
      expect(songDoc!.markdown).toContain('locale: "en-US"');
    }
  });

  test("returns null for unknown routes and nonexistent entity IDs", async () => {
    expect(await renderMarkdownForPath("/nonexistent-route-xyz.md")).toBeNull();
    expect(await renderMarkdownForPath("/cards/999999999.md")).toBeNull();
    expect(await renderMarkdownForPath("/events/999999999.md")).toBeNull();
  });

  test("renders /llms.txt and /llms-full.txt indexes", async () => {
    const summary = await renderLlmsTxt(false);
    expect(summary.body).toContain("# ");
    expect(summary.body).toContain("/llms-full.txt");
    expect(summary.body).toContain(".md");

    const full = await renderLlmsTxt(true);
    expect(full.body.length).toBeGreaterThan(summary.body.length);
    expect(full.dataVersion.length).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DetailSemanticSeoShell from "@/components/seo/DetailSemanticSeoShell";
import { getBuildCards, getBuildCharacters, getBuildEvents, getBuildMusic } from "@/lib/masterdata/build-data";
import { resolveEntitySeo } from "@/lib/seo/entity-seo";

describe("Dynamic Entity SEO & DetailSemanticSeoShell", () => {
  test("resolves localized title, OpenGraph cover, and sr-only semantic shell for member cards", async () => {
    const cards = await getBuildCards("ja-JP");
    expect(cards.length).toBeGreaterThan(0);
    const cardId = String(cards[0]!.id);

    const seo = await resolveEntitySeo("card-detail", cardId, "ja-JP", `/cards/${cardId}`);
    expect(seo).not.toBeNull();
    expect(seo!.meta.title).toBeTruthy();
    expect(seo!.meta.image).toContain("https://");
    expect(seo!.semantic.heading).toContain(cards[0]!.title || cards[0]!.characterName);

    const html = renderToStaticMarkup(<DetailSemanticSeoShell data={seo!.semantic} />);
    expect(html).toContain("sr-only");
    expect(html).toContain("data-semantic-seo");
    expect(html).toContain("<h2");
    expect(html).toContain("<dl>");
    expect(html).not.toContain("<dt></dt>");
  });

  test("resolves event, music, and character detail SEO across locales", async () => {
    const [events, songs, chars] = await Promise.all([
      getBuildEvents("zh-CN"),
      getBuildMusic("en-US"),
      getBuildCharacters("zh-CN"),
    ]);

    if (events[0]) {
      const eventId = String(events[0].id);
      const eventSeo = await resolveEntitySeo("event-detail", eventId, "zh-CN", `/events/${eventId}`);
      expect(eventSeo).not.toBeNull();
      expect(eventSeo!.semantic.sections.length).toBeGreaterThan(0);
    }

    if (songs[0]) {
      const songId = String(songs[0].id);
      const songSeo = await resolveEntitySeo("song-detail", songId, "en-US", `/music/${songId}`);
      expect(songSeo).not.toBeNull();
      expect(songSeo!.meta.title).toContain(songs[0].title);
    }

    if (chars.characters[0]) {
      const charId = String(chars.characters[0].id);
      const charSeo = await resolveEntitySeo("character-detail", charId, "zh-CN", `/characters/${charId}`);
      expect(charSeo).not.toBeNull();
      expect(charSeo!.semantic.heading).toContain(chars.characters[0].name);
    }
  });

  test("returns null for nonexistent or non-numeric entity IDs", async () => {
    expect(await resolveEntitySeo("card-detail", "999999999", "zh-CN", "/cards/999999999")).toBeNull();
    expect(await resolveEntitySeo("card-detail", "not-a-number", "zh-CN", "/cards/not-a-number")).toBeNull();
    expect(await resolveEntitySeo("unknown-component", "1", "zh-CN", "/unknown/1")).toBeNull();
  });
});

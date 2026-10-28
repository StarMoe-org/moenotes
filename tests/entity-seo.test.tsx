import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DetailSemanticSeoShell from "@/components/seo/DetailSemanticSeoShell";
import { getBuildCards, getBuildCharacters, getBuildEvents, getBuildMusic } from "@/lib/masterdata/build-data";
import { resolveEntitySeo } from "@/lib/seo/entity-seo";
import { withSyntheticMasterData } from "./fixtures/synthetic-masterdata";

describe("Dynamic Entity SEO & DetailSemanticSeoShell", () => {
  test("resolves localized title, OpenGraph cover, and sr-only semantic shell for member cards, events, music, and characters", async () => {
    await withSyntheticMasterData(async () => {
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

      const [events, songs, chars] = await Promise.all([
        getBuildEvents("zh-CN"),
        getBuildMusic("en-US"),
        getBuildCharacters("zh-CN"),
      ]);

      expect(events.length).toBeGreaterThan(0);
      const eventSeo = await resolveEntitySeo("event-detail", String(events[0]!.id), "zh-CN", `/events/${events[0]!.id}`);
      expect(eventSeo).not.toBeNull();
      expect(eventSeo!.semantic.sections.length).toBeGreaterThan(0);

      expect(songs.length).toBeGreaterThan(0);
      const songSeo = await resolveEntitySeo("song-detail", String(songs[0]!.id), "en-US", `/music/${songs[0]!.id}`);
      expect(songSeo).not.toBeNull();
      expect(songSeo!.meta.title).toContain(songs[0]!.title);

      expect(chars.characters.length).toBeGreaterThan(0);
      const charSeo = await resolveEntitySeo("character-detail", String(chars.characters[0]!.id), "zh-CN", `/characters/${chars.characters[0]!.id}`);
      expect(charSeo).not.toBeNull();
      expect(charSeo!.semantic.heading).toContain(chars.characters[0]!.name);

      expect(await resolveEntitySeo("card-detail", "999999999", "zh-CN", "/cards/999999999")).toBeNull();
      expect(await resolveEntitySeo("card-detail", "not-a-number", "zh-CN", "/cards/not-a-number")).toBeNull();
      expect(await resolveEntitySeo("unknown-component", "1", "zh-CN", "/unknown/1")).toBeNull();
    });
  });
});

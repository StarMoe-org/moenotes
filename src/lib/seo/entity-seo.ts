import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getAssetUrl } from "@/lib/assets/url";
import { getCardFullUrl, type CardRarity, type CardType } from "@/lib/cards/assets";
import { getSupportCardFullUrl } from "@/lib/support-cards/assets";
import {
  getBuildCardDetail,
  getBuildCharacterDetail,
  getBuildEventDetail,
  getBuildExchangeDetail,
  getBuildGachaDetail,
  getBuildMusicDetail,
  getBuildRewardEntryDetail,
  getBuildStoryDetail,
  getBuildSupportCardDetail,
} from "@/lib/masterdata/build-data";
import { getBuildHelpTopicDetail } from "@/lib/masterdata/build-help";
import { getBuildItemDetail } from "@/lib/masterdata/build-item-sources";
import { getBuildShopDetail } from "@/lib/masterdata/build-shop";
import { buildDynamicPath, findRouteById, getRoutePathById } from "@/lib/route/registry";
import { absolutePageUrl, type PageMetadata } from "@/lib/seo/metadata";
import { valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";

export const CARD_RARITY_LABELS: Record<CardRarity, string> = {
  2: "R",
  3: "SR",
  4: "SSR",
  20: "BD",
};

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  1: "Red",
  2: "Blue",
  3: "Green",
  4: "Yellow",
  5: "Purple",
};

function getCardRarityLabel(rarity: number): string {
  return CARD_RARITY_LABELS[rarity as CardRarity] ?? String(rarity);
}

export interface SemanticSeoFact {
  label: string;
  value: string;
}

export interface SemanticSeoSection {
  title: string;
  items: string[];
}

export interface SemanticSeoLink {
  label: string;
  href: string;
}

export interface DetailSemanticSeoData {
  heading: string;
  summary: string;
  image?: string | undefined;
  facts: SemanticSeoFact[];
  sections: SemanticSeoSection[];
  links: SemanticSeoLink[];
  jsonLd?: Record<string, unknown> | undefined;
}

export interface EntitySeoBundle {
  meta: Partial<PageMetadata>;
  semantic: DetailSemanticSeoData | null;
}

function pickValue<T>(faceted: ServerFacetedValue<T> | null | undefined): { server: GameServer; value: T } | null {
  if (!faceted || faceted.servers.length === 0) return null;
  const server = faceted.servers[0]!;
  return { server, value: valueForServer(faceted, server) };
}

function detailHref(routeId: string, id: string | number, locale: AppLocale): string {
  const route = findRouteById(routeId);
  if (!route) return localizePath(getRoutePathById("home"), locale);
  const pattern = route.pattern ?? route.path;
  return localizePath(buildDynamicPath(pattern, { id: String(id) }), locale);
}

function truncateText(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export async function resolveEntitySeo(
  component: string | undefined,
  paramId: string | undefined,
  locale: AppLocale,
  pathname: string,
): Promise<EntitySeoBundle | null> {
  if (!component || !paramId) return null;
  const canonicalUrl = absolutePageUrl(localizePath(pathname, locale));

  switch (component) {
    case "card-detail": {
      const cardId = Number(paramId);
      if (!Number.isFinite(cardId)) return null;
      const detail = await getBuildCardDetail(locale, cardId);
      const picked = pickValue(detail);
      const card = picked?.value.card ?? detail.value?.card ?? null;
      if (!card) return null;
      const skills = picked?.value.skills ?? [];
      const rarityLabel = CARD_RARITY_LABELS[card.rarity] ?? String(card.rarity);
      const typeLabel = CARD_TYPE_LABELS[card.cardType] ?? String(card.cardType);
      const heading = `${card.characterName} - ${card.title}`;
      const image = getCardFullUrl(card.assetId);
      const skillSummaries = skills.map((skill) => {
        const top = skill.levels.at(-1);
        return `${skill.name}${top ? ` (Lv.${top.level}: ${top.description})` : ""}`;
      });
      const summary = truncateText(
        [
          `${heading} (${rarityLabel}, ${typeLabel})`,
          card.bandName,
          `Total ${card.totalPower} (PF ${card.performancePower} / TC ${card.technicPower} / VI ${card.visualPower})`,
          skillSummaries[0] ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      return {
        meta: { title: heading, description: summary, image },
        semantic: {
          heading,
          summary,
          image,
          facts: [
            { label: "ID", value: String(card.id) },
            { label: t(locale, "nav.items.characters") || "Character", value: card.characterName },
            { label: t(locale, "cards.band") || "Band", value: card.bandName },
            { label: t(locale, "cards.rarity") || "Rarity", value: rarityLabel },
            { label: t(locale, "cards.attribute") || "Attribute", value: typeLabel },
            { label: "Total Power", value: `${card.totalPower} (${card.performancePower} / ${card.technicPower} / ${card.visualPower})` },
            ...(card.startAt ? [{ label: "Release", value: card.startAt }] : []),
            { label: "Servers", value: detail.servers.map((s) => s.toUpperCase()).join(", ") },
          ],
          sections: [
            ...(skillSummaries.length > 0 ? [{ title: t(locale, "cards.skill") || "Skills", items: skillSummaries }] : []),
            ...(card.gachaVoice ? [{ title: "Gacha Quote", items: [card.gachaVoice] }] : []),
          ],
          links: [
            { label: card.characterName, href: detailHref("character-detail", card.characterId, locale) },
            { label: t(locale, "nav.items.cards"), href: localizePath(getRoutePathById("cards"), locale) },
          ],
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Thing",
            name: heading,
            description: summary,
            image,
            url: canonicalUrl,
          },
        },
      };
    }

    case "support-card-detail": {
      const supportId = Number(paramId);
      if (!Number.isFinite(supportId)) return null;
      const detail = await getBuildSupportCardDetail(locale, supportId);
      const picked = pickValue(detail);
      const card = picked?.value.card ?? detail.value?.card ?? null;
      if (!card) return null;
      const skills = picked?.value.skills ?? [];
      const heading = `${card.name} - ${card.title}`;
      const image = getSupportCardFullUrl(card.assetId);
      const skillSummaries = skills.map((skill) => {
        const top = skill.levels.at(-1);
        return `${skill.name}${top ? ` (Lv.${top.level}: ${top.description})` : ""}`;
      });
      const summary = truncateText(
        [heading, card.bandName, `Total ${card.totalPower}`, card.diaryText || skillSummaries[0] || ""].filter(Boolean).join(" · "),
      );
      return {
        meta: { title: heading, description: summary, image },
        semantic: {
          heading,
          summary,
          image,
          facts: [
            { label: "ID", value: String(card.id) },
            { label: t(locale, "cards.band"), value: card.bandName },
            { label: "Characters", value: card.characters.map((c: { name: string }) => c.name).join(", ") },
            { label: "Total Power", value: `${card.totalPower} (${card.performancePower} / ${card.technicPower} / ${card.visualPower})` },
            ...(card.startAt ? [{ label: "Release", value: card.startAt }] : []),
          ],
          sections: [
            ...(skillSummaries.length > 0 ? [{ title: t(locale, "cards.skill") || "Skills", items: skillSummaries }] : []),
            ...(card.diaryText ? [{ title: "Diary", items: [card.diaryText] }] : []),
          ],
          links: [
            ...card.characters.map((c: { id: number; name: string }) => ({ label: c.name, href: detailHref("character-detail", c.id, locale) })),
            { label: t(locale, "nav.items.supportCards"), href: localizePath(getRoutePathById("support-cards"), locale) },
          ],
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Thing",
            name: heading,
            description: summary,
            image,
            url: canonicalUrl,
          },
        },
      };
    }

    case "song-detail": {
      const songId = Number(paramId);
      if (!Number.isFinite(songId)) return null;
      const song = await getBuildMusicDetail(locale, songId);
      if (!song) return null;
      const diffText = song.difficulties
        .map((d) => `${d.difficulty.toUpperCase()} Lv.${d.displayLevel} (${d.notesCount} notes)`)
        .join(", ");
      const summary = truncateText(
        [
          song.title,
          song.bandName,
          song.composer ? `Composer: ${song.composer}` : "",
          diffText,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      return {
        meta: { title: song.title, description: summary, image: song.jacketUrl },
        semantic: {
          heading: song.title,
          summary,
          image: song.jacketUrl,
          facts: [
            { label: "ID", value: String(song.id) },
            ...(song.bandName ? [{ label: t(locale, "cards.band"), value: song.bandName }] : []),
            ...(song.lyricist ? [{ label: t(locale, "music.lyricist"), value: song.lyricist }] : []),
            ...(song.composer ? [{ label: t(locale, "music.composer"), value: song.composer }] : []),
            ...(song.arranger ? [{ label: t(locale, "music.arranger"), value: song.arranger }] : []),
            ...(song.vocalists.length > 0 ? [{ label: "Vocals", value: song.vocalists.map((v) => v.name).join(", ") }] : []),
            ...(song.startAt ? [{ label: "Release", value: song.startAt }] : []),
          ],
          sections: [
            ...(song.difficulties.length > 0
              ? [{ title: "Charts", items: song.difficulties.map((d) => `${d.difficulty.toUpperCase()}: Lv.${d.displayLevel} (${d.notesCount} notes)`) }]
              : []),
          ],
          links: [{ label: t(locale, "nav.items.music"), href: localizePath(getRoutePathById("music"), locale) }],
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "MusicRecording",
            name: song.title,
            ...(song.bandName ? { byArtist: { "@type": "MusicGroup", name: song.bandName } } : {}),
            image: song.jacketUrl,
            url: canonicalUrl,
          },
        },
      };
    }

    case "event-detail": {
      const eventId = Number(paramId);
      if (!Number.isFinite(eventId)) return null;
      const faceted = await getBuildEventDetail(locale, eventId);
      const picked = pickValue(faceted);
      const event = picked?.value ?? null;
      if (!event) return null;
      const charNames = event.characters.map((c) => c.name).join(", ");
      const summary = truncateText(
        [
          event.name,
          event.startAt && event.endAt ? `${event.startAt} - ${event.endAt}` : "",
          charNames,
          event.chapterDescription || "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      const image = event.bannerUrl || event.logoUrl;
      return {
        meta: { title: event.name, description: summary, ...(image ? { image } : {}) },
        semantic: {
          heading: event.name,
          summary,
          ...(image ? { image } : {}),
          facts: [
            { label: "ID", value: String(event.id) },
            ...(event.startAt ? [{ label: "Start", value: event.startAt }] : []),
            ...(event.endAt ? [{ label: "End", value: event.endAt }] : []),
            ...(charNames ? [{ label: "Characters", value: charNames }] : []),
            ...(event.music ? [{ label: t(locale, "nav.items.music"), value: event.music.title }] : []),
          ],
          sections: [
            ...(event.cards.length > 0
              ? [{ title: t(locale, "nav.items.cards"), items: event.cards.map((c) => `${c.characterName} - ${c.title} (${getCardRarityLabel(c.rarity)})`) }]
              : []),
            ...(event.story.length > 0
              ? [{ title: t(locale, "nav.story"), items: event.story.map((ep) => `${ep.episodeNumber ? `#${ep.episodeNumber} ` : ""}${ep.title}`) }]
              : []),
          ],
          links: [
            ...event.cards.map((c) => ({ label: `${c.characterName} - ${c.title}`, href: detailHref("card-detail", c.id, locale) })),
            ...(event.music ? [{ label: event.music.title, href: detailHref("song-detail", event.music.id, locale) }] : []),
            { label: t(locale, "nav.items.eventList"), href: localizePath(getRoutePathById("event-list"), locale) },
          ],
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Event",
            name: event.name,
            description: summary,
            startDate: event.startAt,
            endDate: event.endAt,
            eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
            ...(image ? { image } : {}),
            url: canonicalUrl,
          },
        },
      };
    }

    case "gacha-detail": {
      const gachaId = Number(paramId);
      if (!Number.isFinite(gachaId)) return null;
      const faceted = await getBuildGachaDetail(locale, gachaId);
      const picked = pickValue(faceted);
      const gacha = picked?.value ?? null;
      if (!gacha) return null;
      const heading = gacha.name || `Gacha #${gacha.id}`;
      const pickups = gacha.memberCards
        .filter((c) => gacha.pickupMemberIds.includes(c.id))
        .map((c) => `${c.characterName} - ${c.title}`);
      const summary = truncateText(
        [
          heading,
          gacha.startAt && gacha.endAt ? `${gacha.startAt} - ${gacha.endAt}` : "",
          pickups.join(", "),
          gacha.description,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      return {
        meta: { title: heading, description: summary, ...(gacha.bannerPath ? { image: gacha.bannerPath } : {}) },
        semantic: {
          heading,
          summary,
          ...(gacha.bannerPath ? { image: gacha.bannerPath } : {}),
          facts: [
            { label: "ID", value: String(gacha.id) },
            ...(gacha.startAt ? [{ label: "Start", value: gacha.startAt }] : []),
            ...(gacha.endAt ? [{ label: "End", value: gacha.endAt }] : []),
            { label: "Category", value: gacha.category },
          ],
          sections: [
            ...(pickups.length > 0 ? [{ title: "Rate-Up Cards", items: pickups }] : []),
            ...(gacha.pools.length > 0
              ? [{ title: "Pools", items: gacha.pools.map((p) => `${p.kind} (Rarity ${p.rarity}): ${p.rate.toFixed(2)}% (${p.count})`) }]
              : []),
          ],
          links: [{ label: t(locale, "nav.items.gacha"), href: localizePath(getRoutePathById("gacha"), locale) }],
        },
      };
    }

    case "character-detail": {
      const charId = Number(paramId);
      if (!Number.isFinite(charId)) return null;
      const faceted = await getBuildCharacterDetail(locale, charId);
      const picked = pickValue(faceted);
      const char = picked?.value.character ?? null;
      if (!char) return null;
      const cards = picked?.value.cards ?? [];
      const summary = truncateText(
        [char.name, char.bandName, char.voiceActor ? `CV: ${char.voiceActor}` : "", char.catchCopy, char.description]
          .filter(Boolean)
          .join(" · "),
      );
      return {
        meta: { title: char.name, description: summary },
        semantic: {
          heading: char.name,
          summary,
          facts: [
            { label: "ID", value: String(char.id) },
            ...(char.bandName ? [{ label: t(locale, "cards.band"), value: char.bandName }] : []),
            ...(char.voiceActor ? [{ label: "CV", value: char.voiceActor }] : []),
            ...(char.birthday ? [{ label: "Birthday", value: char.birthday }] : []),
            ...(char.height ? [{ label: "Height", value: char.height }] : []),
            ...(char.school ? [{ label: "School", value: char.school }] : []),
            ...(char.hobby ? [{ label: "Hobby", value: char.hobby }] : []),
            ...(char.favoriteFood ? [{ label: "Favorite Food", value: char.favoriteFood }] : []),
          ],
          sections: [
            ...(char.description ? [{ title: "Profile", items: [char.description] }] : []),
            ...(cards.length > 0
              ? [{ title: t(locale, "nav.items.cards"), items: cards.slice(0, 20).map((c) => `${c.title} (${getCardRarityLabel(c.rarity)})`) }]
              : []),
          ],
          links: [
            ...cards.slice(0, 10).map((c) => ({ label: c.title, href: detailHref("card-detail", c.id, locale) })),
            { label: t(locale, "nav.items.characters"), href: localizePath(getRoutePathById("characters"), locale) },
          ],
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Person",
            name: char.name,
            description: summary,
            url: canonicalUrl,
          },
        },
      };
    }

    case "story-detail": {
      const advId = Number(paramId);
      if (!Number.isFinite(advId)) return null;
      const detail = await getBuildStoryDetail(locale, advId);
      const heading = detail.title || `ADV ${advId}`;
      const dialoguePreview = (detail.script?.lines ?? [])
        .filter((l) => l.text.trim())
        .slice(0, 12)
        .map((l) => (l.speaker ? `${l.speaker}: ${l.text}` : l.text));
      const summary = truncateText(
        [heading, detail.story?.groupTitle ?? "", dialoguePreview.slice(0, 2).join(" ")].filter(Boolean).join(" · "),
      );
      return {
        meta: { title: heading, description: summary || heading },
        semantic: {
          heading,
          summary: summary || heading,
          facts: [
            { label: "ADV ID", value: String(advId) },
            ...(detail.story?.groupTitle ? [{ label: "Chapter", value: detail.story.groupTitle }] : []),
            ...(detail.story?.characterNames?.length ? [{ label: "Characters", value: detail.story.characterNames.join(", ") }] : []),
          ],
          sections: dialoguePreview.length > 0 ? [{ title: "Dialogue Preview", items: dialoguePreview }] : [],
          links: [
            ...(detail.previous ? [{ label: detail.previous.title, href: detailHref("story-detail", detail.previous.advId, locale) }] : []),
            ...(detail.next ? [{ label: detail.next.title, href: detailHref("story-detail", detail.next.advId, locale) }] : []),
          ],
        },
      };
    }

    case "item-detail": {
      const itemId = Number(paramId);
      if (!Number.isFinite(itemId)) return null;
      const faceted = await getBuildItemDetail(locale, itemId);
      const picked = pickValue(faceted);
      const detail = picked?.value ?? null;
      if (!detail) return null;
      const itemImage = detail.item.imagePath ? getAssetUrl({ path: detail.item.imagePath }) : undefined;
      const summary = truncateText([detail.item.name, detail.item.desc].filter(Boolean).join(" · "));
      return {
        meta: { title: detail.item.name, description: summary || detail.item.name, ...(itemImage ? { image: itemImage } : {}) },
        semantic: {
          heading: detail.item.name,
          summary: summary || detail.item.name,
          image: itemImage,
          facts: [
            { label: "ID", value: String(detail.item.id) },
            ...(detail.max > 0 ? [{ label: "Max Stack", value: String(detail.max) }] : []),
          ],
          sections: detail.item.desc ? [{ title: "Description", items: [detail.item.desc] }] : [],
          links: [{ label: t(locale, "nav.items.items"), href: localizePath(getRoutePathById("items"), locale) }],
        },
      };
    }

    case "exchange-detail": {
      const exchangeId = Number(paramId);
      if (!Number.isFinite(exchangeId)) return null;
      const faceted = await getBuildExchangeDetail(locale, exchangeId);
      const picked = pickValue(faceted);
      const exchange = picked?.value ?? null;
      if (!exchange) return null;
      const summary = truncateText(
        [exchange.name, exchange.categoryName, exchange.currency.name ? `Currency: ${exchange.currency.name}` : ""].filter(Boolean).join(" · "),
      );
      return {
        meta: { title: exchange.name, description: summary || exchange.name, ...(exchange.bannerUrl ? { image: exchange.bannerUrl } : {}) },
        semantic: {
          heading: exchange.name,
          summary: summary || exchange.name,
          facts: [
            { label: "ID", value: String(exchange.id) },
            ...(exchange.categoryName ? [{ label: "Category", value: exchange.categoryName }] : []),
            ...(exchange.currency.name ? [{ label: "Currency", value: exchange.currency.name }] : []),
          ],
          sections:
            exchange.products.length > 0
              ? [{ title: "Products", items: exchange.products.slice(0, 20).map((p) => `${p.reward.name} x${p.reward.count} (${p.price})`) }]
              : [],
          links: [{ label: t(locale, "nav.items.exchange"), href: localizePath(getRoutePathById("exchange"), locale) }],
        },
      };
    }

    case "shop-detail": {
      const shopId = Number(paramId);
      if (!Number.isFinite(shopId)) return null;
      const faceted = await getBuildShopDetail(locale, shopId);
      const picked = pickValue(faceted);
      const shop = picked?.value ?? null;
      if (!shop) return null;
      const summary = truncateText([shop.name, shop.description].filter(Boolean).join(" · "));
      return {
        meta: { title: shop.name, description: summary || shop.name, ...(shop.thumbnailUrl ? { image: shop.thumbnailUrl } : {}) },
        semantic: {
          heading: shop.name,
          summary: summary || shop.name,
          facts: [{ label: "ID", value: String(shop.id) }],
          sections:
            shop.products.length > 0
              ? [{ title: "Contents", items: shop.products.map((p) => `${p.reward.name} x${p.reward.count}`) }]
              : [],
          links: [{ label: t(locale, "nav.items.shop"), href: localizePath(getRoutePathById("shop"), locale) }],
        },
      };
    }

    case "reward-detail": {
      const faceted = await getBuildRewardEntryDetail(locale, paramId);
      const picked = pickValue(faceted);
      const entry = picked?.value ?? null;
      if (!entry) return null;
      const heading = entry.title || paramId;
      const summary = truncateText([heading, entry.highlights.map((h) => h.name).filter(Boolean).join(", ")].filter(Boolean).join(" · "));
      return {
        meta: { title: heading, description: summary || heading, ...(entry.bannerUrl ? { image: entry.bannerUrl } : {}) },
        semantic: {
          heading,
          summary: summary || heading,
          facts: [
            { label: "Kind", value: entry.kind },
            ...(entry.startAt ? [{ label: "Start", value: entry.startAt }] : []),
            ...(entry.endAt ? [{ label: "End", value: entry.endAt }] : []),
          ],
          sections:
            entry.highlights.length > 0
              ? [{ title: "Highlights", items: entry.highlights.map((h) => `${h.name} x${h.count}`) }]
              : [],
          links: [{ label: t(locale, "nav.items.rewards"), href: localizePath(getRoutePathById("rewards"), locale) }],
        },
      };
    }

    case "help-detail": {
      const helpId = Number(paramId);
      if (!Number.isFinite(helpId)) return null;
      const faceted = await getBuildHelpTopicDetail(locale, helpId);
      const picked = pickValue(faceted);
      const detail = picked?.value ?? null;
      if (!detail) return null;
      const summary = truncateText([detail.topic.title, detail.topic.body.text].filter(Boolean).join(" · "));
      return {
        meta: { title: detail.topic.title, description: summary || detail.topic.title },
        semantic: {
          heading: detail.topic.title,
          summary: summary || detail.topic.title,
          facts: [
            { label: "ID", value: String(detail.topic.id) },
            ...(detail.topic.categoryTitle ? [{ label: "Category", value: detail.topic.categoryTitle }] : []),
          ],
          sections: detail.topic.body.text ? [{ title: "Guide", items: [detail.topic.body.text] }] : [],
          links: [{ label: t(locale, "nav.items.help"), href: localizePath(getRoutePathById("help"), locale) }],
        },
      };
    }

    default:
      return null;
  }
}

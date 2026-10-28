import { LOCALE_LABELS, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { siteConfig } from "@/config/site";
import { t } from "@/i18n";
import { getChartDataGuide } from "@/i18n/guides/chart-data";
import { getDeckGuide } from "@/i18n/guides/deck";
import { getLegalTexts } from "@/i18n/legal";
import { localizePath } from "@/i18n/routing";
import { MISSION_CATEGORY_KEYS } from "@/lib/missions/data";
import { CARD_RARITY_LABELS, CARD_TYPE_LABELS } from "@/lib/seo/entity-seo";
import {
  estimateMarkdownTokens,
  markdownAbsoluteUrl,
  markdownPathFor,
  parseMarkdownTarget,
  prefersMarkdownAccept,
} from "@/lib/markdown/negotiate";
import {
  getBuildBackgrounds,
  getBuildBandItems,
  getBuildCardDetail,
  getBuildCards,
  getBuildCharacterDetail,
  getBuildCharacters,
  getBuildComics,
  getBuildDegrees,
  getBuildEventDetail,
  getBuildEvents,
  getBuildExchange,
  getBuildExchangeDetail,
  getBuildGachaDetail,
  getBuildGachas,
  getBuildHomeData,
  getBuildItems,
  getBuildMusic,
  getBuildMusicDetail,
  getBuildRewardEntries,
  getBuildRewardEntryDetail,
  getBuildStamps,
  getBuildStories,
  getBuildStoryDetail,
  getBuildSupportCardDetail,
  getBuildSupportCards,
} from "@/lib/masterdata/build-data";
import { getBuildCatalogCounts } from "@/lib/masterdata/build-catalog";
import { getBuildHelp, getBuildHelpTopicDetail } from "@/lib/masterdata/build-help";
import { getBuildItemDetail } from "@/lib/masterdata/build-item-sources";
import { getBuildLimitedMissionGroups, getBuildRegularMissions } from "@/lib/masterdata/build-missions";
import { getBuildRealLives } from "@/lib/masterdata/build-real-lives";
import { getBuildShopDetail, getBuildShops } from "@/lib/masterdata/build-shop";
import { getBuildManifest } from "@/lib/masterdata/build-snapshot";
import { getBuildTgwCard } from "@/lib/masterdata/build-vip";
import { buildDynamicPath, findRouteById, findRouteMatch, getNavChildren, getNavigationGroups, getRoutePathById } from "@/lib/route/registry";
import { resolveEntitySeo } from "@/lib/seo/entity-seo";
import { absolutePageUrl, absoluteUrl, buildPageMetadata } from "@/lib/seo/metadata";
import { valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { inStorySection, type StorySection } from "@/lib/story/sections";

export {
  estimateMarkdownTokens,
  markdownAbsoluteUrl,
  markdownPathFor,
  parseMarkdownTarget,
  prefersMarkdownAccept,
};

export interface MarkdownDocumentResult {
  markdown: string;
  tokens: number;
  dataVersion: string;
  canonicalUrl: string;
  markdownUrl: string;
}

function mdCell(value: string | number | undefined | null): string {
  return String(value ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function mdTable(headers: string[], rows: Array<Array<string | number>>): string {
  if (rows.length === 0) return "";
  const head = `| ${headers.map(mdCell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(mdCell).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function detailMdLink(routeId: string, id: string | number, locale: AppLocale, label: string): string {
  const route = findRouteById(routeId);
  if (!route) return mdCell(label);
  const path = buildDynamicPath(route.pattern ?? route.path, { id: String(id) });
  return `[${mdCell(label)}](${markdownPathFor(path, locale)})`;
}

function pickFirst<T>(faceted: ServerFacetedValue<T> | null | undefined): T | null {
  if (!faceted || faceted.servers.length === 0) return null;
  return valueForServer(faceted, faceted.servers[0]!) ?? faceted.value ?? null;
}

function getCardRarityLabel(rarity: number): string {
  return CARD_RARITY_LABELS[rarity as keyof typeof CARD_RARITY_LABELS] ?? String(rarity);
}

function getCardTypeLabel(cardType: number, _locale?: AppLocale): string {
  return CARD_TYPE_LABELS[cardType as keyof typeof CARD_TYPE_LABELS] ?? String(cardType);
}

function yamlEscape(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, " ").trim());
}

export async function renderMarkdownForPath(rawPathname: string): Promise<MarkdownDocumentResult | null> {
  const target = parseMarkdownTarget(rawPathname);
  if (!target) return null;
  const { locale, pathname } = target;
  const match = findRouteMatch(pathname);
  if (!match) return null;

  const manifest = await getBuildManifest();
  const dataVersion = manifest.dataVersion || "unknown";
  const component = match.item.component ?? "page";
  const paramId = match.params.id;

  const entitySeo = await resolveEntitySeo(component, paramId, locale, pathname);
  const meta = buildPageMetadata(pathname, locale, entitySeo?.meta);
  const canonicalUrl = meta.canonical;
  const mdUrl = markdownAbsoluteUrl(pathname, locale);

  const lines: string[] = [
    "---",
    `title: ${yamlEscape(meta.fullTitle)}`,
    `description: ${yamlEscape(meta.description)}`,
    `canonical: ${yamlEscape(canonicalUrl)}`,
    `markdown_url: ${yamlEscape(mdUrl)}`,
    `locale: ${yamlEscape(locale)}`,
    `data_version: ${yamlEscape(dataVersion)}`,
    "---",
    "",
  ];

  const body = await renderComponentMarkdown(component, match.item.id, paramId, locale, pathname, meta.title, meta.description, match.isGroupLanding);
  if (body === null) return null;

  lines.push(body);
  const markdown = `${lines.join("\n").trimEnd()}\n`;
  return {
    markdown,
    tokens: estimateMarkdownTokens(markdown),
    dataVersion,
    canonicalUrl,
    markdownUrl: mdUrl,
  };
}

async function renderComponentMarkdown(
  component: string,
  routeId: string,
  paramId: string | undefined,
  locale: AppLocale,
  pathname: `/${string}`,
  defaultTitle: string,
  defaultDescription: string,
  isGroupLanding: boolean,
): Promise<string | null> {
  switch (component) {
    case "home": {
      const homeData = await getBuildHomeData(locale);
      const server = homeData.servers[0];
      const home = server ? valueForServer(homeData, server) : null;
      const sections: string[] = [`# ${siteConfig.name} — ${t(locale, "home.heading")}`, "", defaultDescription, ""];
      if (home) {
        if (home.events.length > 0) {
          sections.push(`## ${t(locale, "nav.items.eventList")}`, "");
          sections.push(
            mdTable(
              ["ID", "Event", "Start", "End"],
              home.events.map((ev) => [ev.id, detailMdLink("event-detail", ev.id, locale, ev.name), ev.startAt, ev.endAt]),
            ),
            "",
          );
        }
        if (home.latestCards.length > 0) {
          sections.push(`## ${t(locale, "nav.items.cards")}`, "");
          sections.push(
            mdTable(
              ["ID", "Character", "Title", "Rarity"],
              home.latestCards.map((c) => [c.id, c.characterName, detailMdLink("card-detail", c.id, locale, c.title), getCardRarityLabel(c.rarity)]),
            ),
            "",
          );
        }
        if (home.latestMusic.length > 0) {
          sections.push(`## ${t(locale, "nav.items.music")}`, "");
          sections.push(
            mdTable(
              ["ID", "Song", "Band"],
              home.latestMusic.map((s) => [s.id, detailMdLink("song-detail", s.id, locale, s.title), s.bandName]),
            ),
            "",
          );
        }
      }
      sections.push(`## ${t(locale, "home.shortcuts")}`, "");
      for (const group of getNavigationGroups()) {
        const children = getNavChildren(group);
        const items = children.length > 0 ? children : [group];
        for (const route of items) {
          sections.push(`- [${t(locale, route.labelKey)}](${markdownPathFor(route.path, locale)}): ${t(locale, route.seo.descriptionKey)}`);
        }
      }
      return sections.join("\n");
    }

    case "cards": {
      const cards = await getBuildCards(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", t(locale, "cards.character"), "Title", t(locale, "cards.band"), t(locale, "cards.rarity"), t(locale, "cards.attribute"), "Power"],
          cards.map((c) => [
            c.id,
            c.characterName,
            detailMdLink("card-detail", c.id, locale, c.title),
            c.bandName,
            getCardRarityLabel(c.rarity),
            getCardTypeLabel(c.cardType, locale),
            c.totalPower,
          ]),
        ),
      ].join("\n");
    }

    case "card-detail": {
      const cardId = Number(paramId);
      if (!Number.isFinite(cardId)) return null;
      const detail = await getBuildCardDetail(locale, cardId);
      const val = pickFirst(detail);
      if (!val?.card) return null;
      const { card, skills } = val;
      const rarityLabel = getCardRarityLabel(card.rarity);
      const typeLabel = getCardTypeLabel(card.cardType, locale);
      const out: string[] = [
        `# ${card.characterName} - ${card.title}`,
        "",
        mdTable(
          ["Field", "Value"],
          [
            ["ID", card.id],
            [t(locale, "cards.character"), detailMdLink("character-detail", card.characterId, locale, card.characterName)],
            [t(locale, "cards.band"), card.bandName],
            [t(locale, "cards.rarity"), rarityLabel],
            [t(locale, "cards.attribute"), typeLabel],
            ["Performance", card.performancePower],
            ["Technic", card.technicPower],
            ["Visual", card.visualPower],
            ["Total Power", card.totalPower],
            ["Release", card.startAt],
            ["Servers", detail.servers.map((s) => s.toUpperCase()).join(", ")],
          ],
        ),
        "",
      ];
      if (card.gachaVoice) {
        out.push(`> ${card.gachaVoice.replace(/\r?\n/g, " ")}`, "");
      }
      if (skills.length > 0) {
        out.push(`## ${t(locale, "cards.skills")}`, "");
        for (const skill of skills) {
          out.push(`### ${skill.name} (${skill.kind})`, "");
          out.push(
            mdTable(
              ["Level", "Description"],
              skill.levels.map((lv) => [`Lv.${lv.level}`, lv.description]),
            ),
            "",
          );
        }
      }
      return out.join("\n");
    }

    case "support-cards": {
      const cards = await getBuildSupportCards(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", "Name", "Title", t(locale, "cards.band"), t(locale, "cards.rarity"), "Power"],
          cards.map((c) => [
            c.id,
            c.name,
            detailMdLink("support-card-detail", c.id, locale, c.title),
            c.bandName,
            c.rarity,
            c.totalPower,
          ]),
        ),
      ].join("\n");
    }

    case "support-card-detail": {
      const supportId = Number(paramId);
      if (!Number.isFinite(supportId)) return null;
      const detail = await getBuildSupportCardDetail(locale, supportId);
      const val = pickFirst(detail);
      if (!val?.card) return null;
      const { card, skills } = val;
      const out: string[] = [
        `# ${card.name} - ${card.title}`,
        "",
        mdTable(
          ["Field", "Value"],
          [
            ["ID", card.id],
            [t(locale, "cards.band"), card.bandName],
            ["Characters", card.characters.map((c) => detailMdLink("character-detail", c.id, locale, c.name)).join(", ")],
            ["Performance", card.performancePower],
            ["Technic", card.technicPower],
            ["Visual", card.visualPower],
            ["Total Power", card.totalPower],
            ["Release", card.startAt],
          ],
        ),
        "",
      ];
      if (card.diaryText) out.push(`> ${card.diaryText.replace(/\r?\n/g, " ")}`, "");
      if (skills.length > 0) {
        out.push(`## ${t(locale, "cards.skills")}`, "");
        for (const skill of skills) {
          out.push(`### ${skill.name}`, "");
          out.push(mdTable(["Level", "Description"], skill.levels.map((lv) => [`Lv.${lv.level}`, lv.description])), "");
        }
      }
      return out.join("\n");
    }

    case "music": {
      const songs = await getBuildMusic(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", "Title", t(locale, "cards.band"), t(locale, "music.composer"), "Charts"],
          songs.map((s) => [
            s.id,
            detailMdLink("song-detail", s.id, locale, s.title),
            s.bandName,
            s.composer,
            s.difficulties.map((d) => `${d.difficulty.toUpperCase()} ${d.displayLevel}`).join(" / "),
          ]),
        ),
      ].join("\n");
    }

    case "song-detail": {
      const songId = Number(paramId);
      if (!Number.isFinite(songId)) return null;
      const song = await getBuildMusicDetail(locale, songId);
      if (!song) return null;
      const out: string[] = [
        `# ${song.title}`,
        "",
        mdTable(
          ["Field", "Value"],
          [
            ["ID", song.id],
            ...(song.titleJa && song.titleJa !== song.title ? [["Original Title", song.titleJa]] : []),
            [t(locale, "cards.band"), song.bandName],
            [t(locale, "music.lyricist"), song.lyricist],
            [t(locale, "music.composer"), song.composer],
            [t(locale, "music.arranger"), song.arranger],
            ["Vocals", song.vocalists.map((v) => detailMdLink("character-detail", v.id, locale, v.name)).join(", ")],
            ["Release", song.startAt],
            ["Servers", song.servers.map((s) => s.toUpperCase()).join(", ")],
          ],
        ),
        "",
      ];
      if (song.difficulties.length > 0) {
        out.push("## Charts", "");
        out.push(
          mdTable(
            ["Difficulty", "Level", "Notes", "Chart Key"],
            song.difficulties.map((d) => [d.difficulty.toUpperCase(), d.displayLevel, d.notesCount, d.chartKey]),
          ),
          "",
        );
      }
      return out.join("\n");
    }

    case "event-list": {
      const events = await getBuildEvents(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", "Event", "Start", "End", "Characters"],
          events.map((ev) => [
            ev.id,
            detailMdLink("event-detail", ev.id, locale, ev.name),
            ev.startAt,
            ev.endAt,
            ev.characters.map((c) => c.name).join(", "),
          ]),
        ),
      ].join("\n");
    }

    case "event-detail": {
      const eventId = Number(paramId);
      if (!Number.isFinite(eventId)) return null;
      const faceted = await getBuildEventDetail(locale, eventId);
      const event = pickFirst(faceted);
      if (!event) return null;
      const out: string[] = [
        `# ${event.name}`,
        "",
        mdTable(
          ["Field", "Value"],
          [
            ["ID", event.id],
            ["Start", event.startAt],
            ["End", event.endAt],
            ["Display End", event.displayEndAt],
            ["Characters", event.characters.map((c) => detailMdLink("character-detail", c.id, locale, c.name)).join(", ")],
            ...(event.music ? [[t(locale, "nav.items.music"), detailMdLink("song-detail", event.music.id, locale, event.music.title)]] : []),
            ...(event.bannerUrl ? [["Banner", event.bannerUrl]] : []),
          ],
        ),
        "",
      ];
      if (event.chapterDescription) {
        out.push(event.chapterDescription, "");
      }
      if (event.cards.length > 0) {
        out.push(`## ${t(locale, "nav.items.cards")}`, "");
        out.push(
          mdTable(
            ["ID", "Character", "Title", "Rarity", "Power"],
            event.cards.map((c) => [
              c.id,
              c.characterName,
              detailMdLink("card-detail", c.id, locale, c.title),
              getCardRarityLabel(c.rarity),
              c.totalPower,
            ]),
          ),
          "",
        );
      }
      if (event.story.length > 0) {
        out.push(`## ${t(locale, "nav.story")}`, "");
        out.push(
          mdTable(
            ["Episode", "Title", "Unlock Points"],
            event.story.map((ep) => [
              ep.episodeNumber ?? "-",
              detailMdLink("story-detail", ep.advId, locale, ep.title),
              ep.eventPoint,
            ]),
          ),
          "",
        );
      }
      if (event.missions.length > 0) {
        out.push(`## ${t(locale, "nav.items.missions")}`, "");
        out.push(
          mdTable(
            ["Mission", "Rewards"],
            event.missions.map((m) => [m.description, m.rewards.map((r) => `${r.name} x${r.count}`).join(", ")]),
          ),
          "",
        );
      }
      return out.join("\n");
    }

    case "gacha": {
      const gachas = await getBuildGachas(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", "Name", "Category", "Limited", "Start", "End"],
          gachas.map((g) => [
            g.id,
            detailMdLink("gacha-detail", g.id, locale, g.name || `#${g.id}`),
            g.category,
            g.isLimited ? "Yes" : "No",
            g.startAt,
            g.endAt,
          ]),
        ),
      ].join("\n");
    }

    case "gacha-detail": {
      const gachaId = Number(paramId);
      if (!Number.isFinite(gachaId)) return null;
      const faceted = await getBuildGachaDetail(locale, gachaId);
      const gacha = pickFirst(faceted);
      if (!gacha) return null;
      const out: string[] = [
        `# ${gacha.name || `Gacha #${gacha.id}`}`,
        "",
        mdTable(
          ["Field", "Value"],
          [
            ["ID", gacha.id],
            ["Category", gacha.category],
            ["Limited", gacha.isLimited ? "Yes" : "No"],
            ["Start", gacha.startAt],
            ["End", gacha.endAt],
          ],
        ),
        "",
      ];
      if (gacha.description) out.push(gacha.description, "");
      if (gacha.pools.length > 0) {
        out.push("## Drop Rates", "");
        out.push(
          mdTable(
            ["Kind", "Rarity", "Rate (%)", "Count", "Rate-Up Count"],
            gacha.pools.map((p) => [p.kind, p.rarity || "-", p.rate.toFixed(3), p.count, p.pickupCount]),
          ),
          "",
        );
      }
      const pickupMembers = gacha.memberCards.filter((c) => gacha.pickupMemberIds.includes(c.id));
      if (pickupMembers.length > 0) {
        out.push("## Rate-Up Member Cards", "");
        out.push(
          mdTable(
            ["ID", "Character", "Title", "Rarity"],
            pickupMembers.map((c) => [c.id, c.characterName, detailMdLink("card-detail", c.id, locale, c.title), getCardRarityLabel(c.rarity)]),
          ),
          "",
        );
      }
      return out.join("\n");
    }

    case "characters": {
      const { characters } = await getBuildCharacters(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", "Name", t(locale, "cards.band"), "Part", "CV", "Birthday"],
          characters.map((c) => [
            c.id,
            detailMdLink("character-detail", c.id, locale, c.name),
            c.bandName,
            c.bandPart,
            c.voiceActor,
            c.birthday,
          ]),
        ),
      ].join("\n");
    }

    case "character-detail": {
      const charId = Number(paramId);
      if (!Number.isFinite(charId)) return null;
      const faceted = await getBuildCharacterDetail(locale, charId);
      const val = pickFirst(faceted);
      if (!val?.character) return null;
      const { character: char, cards } = val;
      const out: string[] = [
        `# ${char.name}`,
        "",
        ...(char.catchCopy ? [`> ${char.catchCopy}`, ""] : []),
        ...(char.description ? [char.description, ""] : []),
        mdTable(
          ["Field", "Value"],
          [
            ["ID", char.id],
            [t(locale, "cards.band"), char.bandName],
            ["Part", char.bandPart],
            ["CV", char.voiceActor],
            ["Birthday", char.birthday],
            ["Constellation", char.constellation],
            ["Height", char.height],
            ["Blood Type", char.bloodType],
            ["School", [char.school, char.schoolClass].filter(Boolean).join(" ")],
            ["Hobby", char.hobby],
            ["Favorite Food", char.favoriteFood],
          ].filter(([, v]) => Boolean(v)),
        ),
        "",
      ];
      if (cards.length > 0) {
        out.push(`## ${t(locale, "nav.items.cards")}`, "");
        out.push(
          mdTable(
            ["ID", "Title", "Rarity", "Attribute", "Total Power"],
            cards.map((c) => [
              c.id,
              detailMdLink("card-detail", c.id, locale, c.title),
              getCardRarityLabel(c.rarity),
              getCardTypeLabel(c.cardType, locale),
              c.totalPower,
            ]),
          ),
          "",
        );
      }
      return out.join("\n");
    }

    case "story-main":
    case "story-event":
    case "story-friendship":
    case "story-birthday":
    case "story-other": {
      const sectionMap: Record<string, StorySection> = {
        "story-main": "main",
        "story-event": "event",
        "story-friendship": "friendship",
        "story-birthday": "birthday",
        "story-other": "other",
      };
      const category = sectionMap[component] ?? "main";
      const stories = (await getBuildStories(locale)).filter((s) => inStorySection(category, s));
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ADV ID", "Group", "Title", "Characters", "Release"],
          stories.map((s) => [
            s.advId,
            s.groupTitle || s.bandName,
            detailMdLink("story-detail", s.advId, locale, s.title || `ADV ${s.advId}`),
            s.characterNames.join(", "),
            s.startAt,
          ]),
        ),
      ].join("\n");
    }

    case "story-detail": {
      const advId = Number(paramId);
      if (!Number.isFinite(advId)) return null;
      const detail = await getBuildStoryDetail(locale, advId);
      if (detail.servers.length === 0 && !detail.story && !detail.script) return null;
      const heading = detail.title || `ADV ${advId}`;
      const out: string[] = [
        `# ${heading}`,
        "",
        mdTable(
          ["Field", "Value"],
          [
            ["ADV ID", advId],
            ...(detail.story?.groupTitle ? [["Group", detail.story.groupTitle]] : []),
            ...(detail.story?.characterNames?.length ? [["Characters", detail.story.characterNames.join(", ")]] : []),
            ...(detail.previous ? [["Previous", detailMdLink("story-detail", detail.previous.advId, locale, detail.previous.title)]] : []),
            ...(detail.next ? [["Next", detailMdLink("story-detail", detail.next.advId, locale, detail.next.title)]] : []),
          ],
        ),
        "",
      ];
      if (detail.script && detail.script.lines.length > 0) {
        out.push("## Transcript", "");
        for (const line of detail.script.lines) {
          const text = line.text.replace(/\r?\n/g, " ").trim();
          if (!text) continue;
          if (line.kind === "telop") {
            out.push(`*[${text}]*`, "");
          } else if (line.speaker) {
            out.push(`**${line.speaker}**: ${text}`, "");
          } else {
            out.push(text, "");
          }
        }
      }
      return out.join("\n");
    }

    case "items": {
      const items = await getBuildItems(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", "Name", "Description"],
          items.map((item) => [item.id, detailMdLink("item-detail", item.id, locale, item.name), item.desc]),
        ),
      ].join("\n");
    }

    case "item-detail": {
      const itemId = Number(paramId);
      if (!Number.isFinite(itemId)) return null;
      const detail = pickFirst(await getBuildItemDetail(locale, itemId));
      if (!detail) return null;
      return [
        `# ${detail.item.name}`,
        "",
        ...(detail.item.desc ? [detail.item.desc, ""] : []),
        mdTable(
          ["Field", "Value"],
          [
            ["ID", detail.item.id],
            ...(detail.max > 0 ? [["Max Stack", detail.max]] : []),
            ...(detail.startAt ? [["Start", detail.startAt]] : []),
          ],
        ),
      ].join("\n");
    }

    case "band-items": {
      const items = await getBuildBandItems(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(["ID", "Name", "Description"], items.map((item) => [item.id, item.name, item.description])),
      ].join("\n");
    }

    case "stamps": {
      const stamps = await getBuildStamps(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(["ID", "Name", "Characters"], stamps.map((s) => [s.id, s.name, s.characterNames.join(", ")])),
      ].join("\n");
    }

    case "comics": {
      const comics = await getBuildComics(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(["ID", "Title", "Characters"], comics.map((c) => [c.id, c.name, c.characterNames.join(", ")])),
      ].join("\n");
    }

    case "titles": {
      const titles = await getBuildDegrees(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(["ID", "Name", "Source"], titles.map((d) => [d.id, d.name, d.source])),
      ].join("\n");
    }

    case "backgrounds": {
      const bgs = await getBuildBackgrounds(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(["ID", "Name", "Description"], bgs.map((b) => [b.id, b.name, b.description])),
      ].join("\n");
    }

    case "exchange": {
      const categories = await getBuildExchange(locale);
      const rows = categories.flatMap((cat) =>
        cat.exchanges.map((ex) => [ex.id, detailMdLink("exchange-detail", ex.id, locale, ex.name), cat.name, ex.currency.name, ex.productCount]),
      );
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(["ID", "Exchange", "Category", "Currency", "Products"], rows),
      ].join("\n");
    }

    case "exchange-detail": {
      const exchangeId = Number(paramId);
      if (!Number.isFinite(exchangeId)) return null;
      const ex = pickFirst(await getBuildExchangeDetail(locale, exchangeId));
      if (!ex) return null;
      return [
        `# ${ex.name}`,
        "",
        mdTable(
          ["Field", "Value"],
          [
            ["ID", ex.id],
            ["Category", ex.categoryName],
            ["Currency", ex.currency.name],
            ["Start", ex.startAt],
            ["End", ex.endAt],
          ],
        ),
        "",
        "## Products",
        "",
        mdTable(
          ["Item", "Count", "Price", "Limit"],
          ex.products.map((p) => [p.reward.name, p.reward.count, p.price, p.limitCount || "Unlimited"]),
        ),
      ].join("\n");
    }

    case "shop": {
      const shops = await getBuildShops(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", "Pack", "Limit", "Start", "End"],
          shops.map((s) => [s.id, detailMdLink("shop-detail", s.id, locale, s.name), s.limitCount || "Unlimited", s.startAt, s.endAt]),
        ),
      ].join("\n");
    }

    case "shop-detail": {
      const shopId = Number(paramId);
      if (!Number.isFinite(shopId)) return null;
      const shop = pickFirst(await getBuildShopDetail(locale, shopId));
      if (!shop) return null;
      return [
        `# ${shop.name}`,
        "",
        ...(shop.description ? [shop.description, ""] : []),
        mdTable(["Item", "Count"], shop.products.map((p) => [p.reward.name, p.reward.count])),
      ].join("\n");
    }

    case "rewards": {
      const entries = await getBuildRewardEntries(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["Slug", "Title", "Kind", "Start", "End"],
          entries.map((e) => [e.slug, detailMdLink("reward-detail", e.slug, locale, e.title || e.slug), e.kind, e.startAt, e.endAt]),
        ),
      ].join("\n");
    }

    case "reward-detail": {
      if (!paramId) return null;
      const entry = pickFirst(await getBuildRewardEntryDetail(locale, paramId));
      if (!entry) return null;
      return [
        `# ${entry.title || entry.slug}`,
        "",
        mdTable(
          ["Field", "Value"],
          [
            ["Slug", entry.slug],
            ["Kind", entry.kind],
            ["Start", entry.startAt],
            ["End", entry.endAt],
          ],
        ),
        "",
        "## Highlights",
        "",
        mdTable(["Reward", "Count"], entry.highlights.map((h) => [h.name, h.count])),
      ].join("\n");
    }

    case "missions": {
      const [regular, limited] = await Promise.all([getBuildRegularMissions(locale), getBuildLimitedMissionGroups(locale)]);
      const out: string[] = [`# ${defaultTitle}`, "", defaultDescription, ""];
      for (const cat of regular) {
        const catKey = MISSION_CATEGORY_KEYS[cat.id] ?? "other";
        out.push(`## ${t(locale, `missions.categories.${catKey}`)}`, "");
        out.push(
          mdTable(
            ["Mission", "Rewards"],
            cat.missions.slice(0, 50).map((m) => [m.description, m.rewards.map((r) => `${r.name} x${r.count}`).join(", ")]),
          ),
          "",
        );
      }
      if (limited.length > 0) {
        out.push("## Limited Mission Groups", "");
        out.push(
          mdTable(
            ["Title", "Start", "End"],
            limited.map((g) => [detailMdLink("reward-detail", g.slug, locale, g.title), g.startAt, g.endAt]),
          ),
        );
      }
      return out.join("\n");
    }

    case "real-lives": {
      const lives = await getBuildRealLives(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", "Bands", "Start", "End"],
          lives.map((l) => [l.id, l.bands.map((b) => b.name).join(", "), l.startAt, l.endAt]),
        ),
      ].join("\n");
    }

    case "tgw-card": {
      const card = pickFirst(await getBuildTgwCard(locale));
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        ...(card ? ["", `Ranks available: ${card.ranks.length}`] : []),
      ].join("\n");
    }

    case "help": {
      const help = await getBuildHelp(locale);
      return [
        `# ${defaultTitle}`,
        "",
        defaultDescription,
        "",
        mdTable(
          ["ID", "Topic", "Category"],
          help.topics.map((tp) => [tp.id, detailMdLink("help-detail", tp.id, locale, tp.title), tp.categoryTitle]),
        ),
      ].join("\n");
    }

    case "help-detail": {
      const helpId = Number(paramId);
      if (!Number.isFinite(helpId)) return null;
      const detail = pickFirst(await getBuildHelpTopicDetail(locale, helpId));
      if (!detail) return null;
      return [
        `# ${detail.topic.title}`,
        "",
        ...(detail.topic.categoryTitle ? [`Category: ${detail.topic.categoryTitle}`, ""] : []),
        detail.topic.body.text,
      ].join("\n");
    }

    case "deck-guide": {
      const guide = getDeckGuide(locale);
      const out: string[] = [`# ${guide.title}`, "", guide.lead, ""];
      for (const section of guide.sections) {
        out.push(`## ${section.title}`, "");
        for (const p of section.body ?? []) out.push(p, "");
      }
      return out.join("\n");
    }

    case "chart-data": {
      const guide = getChartDataGuide(locale);
      const out: string[] = [`# ${defaultTitle}`, "", defaultDescription, "", `## ${guide.title}`, "", guide.lead, ""];
      for (const section of guide.sections) {
        out.push(`### ${section.title}`, "");
        for (const p of section.body ?? []) out.push(p, "");
      }
      return out.join("\n");
    }

    case "legal": {
      const docKey = (routeId === "license" || routeId === "terms" || routeId === "privacy") ? routeId : "license";
      const legal = getLegalTexts(locale);
      const doc = legal.documents[docKey];
      const out: string[] = [`# ${defaultTitle}`, "", `Updated: ${legal.updated}`, ""];
      for (const sec of doc.sections) {
        out.push(`## ${sec.title}`, "");
        for (const p of sec.paragraphs ?? []) out.push(p.replaceAll("{repo}", siteConfig.repository ?? ""), "");
        for (const item of sec.items ?? []) out.push(`- ${item}`);
        if (sec.items?.length) out.push("");
      }
      return out.join("\n");
    }

    case "about": {
      return [
        `# ${defaultTitle}`,
        "",
        `Hi, ${t(locale, "about.teamIntro").replace(/<[^>]+>/g, "")}`,
        "",
        t(locale, "about.paragraph1").replace(/<[^>]+>/g, ""),
        "",
        t(locale, "about.paragraph2").replace(/<[^>]+>/g, ""),
        "",
        `- Repository: ${siteConfig.repository ?? ""}`,
        `- Developer: ${siteConfig.developerUrl}`,
      ].join("\n");
    }

    default: {
      const out: string[] = [`# ${defaultTitle}`, "", defaultDescription];
      if (isGroupLanding) {
        const group = findRouteMatch(pathname)?.item;
        const children = group ? getNavChildren(group) : [];
        if (children.length > 0) {
          out.push("", "## Pages", "");
          for (const item of children) {
            out.push(`- [${t(locale, item.labelKey)}](${markdownPathFor(item.path, locale)}): ${t(locale, item.seo.descriptionKey)}`);
          }
        }
      } else {
        out.push("", `Interactive web view: ${absolutePageUrl(localizePath(pathname, locale))}`);
      }
      return out.join("\n");
    }
  }
}

export async function renderLlmsTxt(full = false): Promise<{ body: string; dataVersion: string }> {
  const [manifest, counts, events, cards, songs, { characters, bands }] = await Promise.all([
    getBuildManifest(),
    getBuildCatalogCounts("en-US"),
    getBuildEvents("en-US"),
    getBuildCards("en-US"),
    getBuildMusic("en-US"),
    getBuildCharacters("en-US"),
  ]);
  const dataVersion = manifest.dataVersion || "unknown";

  const lines: string[] = [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description}`,
    "",
    `- Canonical site: ${siteConfig.baseUrl}`,
    `- MasterData version: \`${dataVersion}\``,
    `- Markdown access: append \`.md\` to any page URL (for example \`/cards/1001.md\`, \`/ja/events/4.md\`, \`/index.md\`) or send \`Accept: text/markdown\` on any page URL.`,
    `- Full LLM index: ${absoluteUrl("/llms-full.txt")}`,
    `- Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    "",
    "## Supported Locales",
    "",
    ...SUPPORTED_LOCALES.map((code) => {
      const homeMd = markdownAbsoluteUrl(getRoutePathById("home"), code);
      return `- [${LOCALE_LABELS[code]} (${code})](${homeMd})`;
    }),
    "",
    "## Core Markdown Catalogs (English)",
    "",
  ];

  for (const group of getNavigationGroups()) {
    const children = getNavChildren(group);
    const items = children.length > 0 ? children : [group];
    for (const route of items) {
      const count = counts[route.id];
      const countNote = count ? ` (${count} entries)` : "";
      lines.push(`- [${t("en-US", route.labelKey)}](${markdownAbsoluteUrl(route.path, "en-US")})${countNote}: ${t("en-US", route.seo.descriptionKey)}`);
    }
  }

  if (full) {
    lines.push("", "## Bands & Characters", "");
    lines.push(
      mdTable(
        ["ID", "Character", "Band", "Part", "CV", "Markdown"],
        characters.map((c) => [
          c.id,
          c.name,
          c.bandName,
          c.bandPart,
          c.voiceActor,
          markdownAbsoluteUrl(buildDynamicPath(findRouteById("character-detail")!.pattern!, { id: String(c.id) }), "en-US"),
        ]),
      ),
    );
    if (bands.length > 0) {
      lines.push("", "### Bands", "");
      for (const b of bands) {
        lines.push(`- **${b.name}** (#${b.id})`);
      }
    }
    lines.push("", "## Latest Events", "");
    lines.push(
      mdTable(
        ["ID", "Event", "Start", "End", "Markdown"],
        events.slice(0, 30).map((e) => [
          e.id,
          e.name,
          e.startAt,
          e.endAt,
          markdownAbsoluteUrl(buildDynamicPath(findRouteById("event-detail")!.pattern!, { id: String(e.id) }), "en-US"),
        ]),
      ),
    );
    lines.push("", "## Latest Songs", "");
    lines.push(
      mdTable(
        ["ID", "Title", "Band", "Composer", "Markdown"],
        songs.slice(0, 40).map((s) => [
          s.id,
          s.title,
          s.bandName,
          s.composer,
          markdownAbsoluteUrl(buildDynamicPath(findRouteById("song-detail")!.pattern!, { id: String(s.id) }), "en-US"),
        ]),
      ),
    );
    lines.push("", "## Latest Member Cards", "");
    lines.push(
      mdTable(
        ["ID", "Character", "Title", "Rarity", "Power", "Markdown"],
        cards.slice(0, 40).map((c) => [
          c.id,
          c.characterName,
          c.title,
          getCardRarityLabel(c.rarity),
          c.totalPower,
          markdownAbsoluteUrl(buildDynamicPath(findRouteById("card-detail")!.pattern!, { id: String(c.id) }), "en-US"),
        ]),
      ),
    );
  }

  return { body: `${lines.join("\n").trimEnd()}\n`, dataVersion };
}

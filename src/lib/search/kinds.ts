import type { ContentSearchEntry } from "@/lib/search/content-index";

/** Display order for content-kind groups across the search UIs (SearchPage + CommandPalette). */
export const CONTENT_KIND_ORDER: readonly ContentSearchEntry["kind"][] = [
  "character",
  "card",
  "support-card",
  "music",
  "story",
  "gacha",
  "event",
  "reward",
  "exchange",
  "band-item",
] as const;

/** i18n key used to render the group label for each kind. Defined once so the two search UIs cannot drift. */
export const KIND_LABEL_KEY: Record<ContentSearchEntry["kind"], string> = {
  character: "search.kinds.character",
  card: "search.kinds.card",
  "support-card": "search.kinds.supportCard",
  music: "search.kinds.music",
  story: "search.kinds.story",
  gacha: "search.kinds.gacha",
  event: "search.kinds.event",
  reward: "search.kinds.reward",
  exchange: "search.kinds.exchange",
  "band-item": "search.kinds.bandItem",
};

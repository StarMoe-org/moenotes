import type { AppLocale } from "@/config/locales";
import type { LocalizableMasterText } from "@/lib/masterdata/localize-text";

/**
 * Global content search: one entry per searchable entity (card, song, character, story, gacha, event, reward).
 *
 * Each entry carries its title as the MasterText row's five language cells so the browser can localize it for the
 * current UI locale, plus a per-locale `searchText` (the list pages' own search blob) so matching a member or band
 * name lands on their cards and songs. hrefs are locale-free; the browser prefixes them when navigating.
 */
export interface ContentSearchEntry {
  /** Stable id within its kind (card id, song id, adv id, reward slug, …). */
  key: string;
  kind: "card" | "support-card" | "character" | "music" | "story" | "gacha" | "event" | "reward" | "band-item" | "exchange";
  /** Locale-free detail path, e.g. `/cards/12`. The browser localizes it on render. */
  href: `/${string}`;
  /** Title as a MasterText row (five language cells); localized client-side. */
  title: LocalizableMasterText;
  /** Per-locale search blob (already lowercase); localized client-side with an en fallback. */
  searchText: Partial<Record<AppLocale, string>>;
}

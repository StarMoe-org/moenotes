/**
 * Theme colors from one seed (a band's MasterBand.mainColorCode or a character's MasterCharacter.mainColorCode chosen
 * in the settings): the full Material 3 light and dark schemes (src/lib/md3/scheme.ts). The chosen seed's schemes are
 * cached in browser storage when the settings are applied, so the head's bootstrap script
 * (src/lib/settings/apply-theme.ts) sets them before the first paint without computing anything.
 */
import { md3Schemes } from "@/lib/md3/scheme";
import type { Md3Schemes } from "@/lib/md3/roles";

/** Bumped when the cached shape or the scheme recipe changes: older caches are ignored and rebuilt on hydration. */
export const ACCENT_CACHE_VERSION = 4;

/** What the bootstrap script reads back from storage. */
export interface AccentCache extends Md3Schemes {
  version: typeof ACCENT_CACHE_VERSION;
  color: string;
}

export function accentCache(hex: string): AccentCache | null {
  const schemes = md3Schemes(hex);
  return schemes ? { version: ACCENT_CACHE_VERSION, color: hex, ...schemes } : null;
}

export { contrastRatio } from "@/lib/md3/roles";

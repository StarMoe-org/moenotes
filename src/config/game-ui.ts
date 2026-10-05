import type { GameServer } from "./servers";

/** The international client shares prefabs; artwork remains bound to the content server. */
export function gameUiSources(overrides: Partial<Record<GameServer, string | undefined>>, defaults: { tw: string; jp: string }) {
  const international = overrides.tw ?? defaults.tw;
  return {
    libraries: {
      tw: international, jp: overrides.jp ?? defaults.jp,
      kr: overrides.kr ?? international, en: overrides.en ?? international,
    },
    // Validate the actual exported source region, including regional overrides.
    regions: {
      tw: "tw", jp: "jp", kr: overrides.kr === undefined ? "tw" : "kr",
      en: overrides.en === undefined ? "tw" : "en",
    } satisfies Record<GameServer, GameServer>,
  };
}

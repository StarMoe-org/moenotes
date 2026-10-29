/**
 * Public settings next.config.ts inlines into the browser bundle (Next's `env` option). Only names the environment
 * actually sets are included: an unset name stays absent so the module defaults still apply, while an explicit ""
 * stays empty, which is how an empty value disables a source (see docs/game-ui.md).
 */
export const PUBLIC_ENV_KEYS = [
  "PUBLIC_ASSET_API",
  "PUBLIC_RECOGNITION_SITE",
  "PUBLIC_GAME_UI_LIBRARY_TW",
  "PUBLIC_GAME_UI_LIBRARY_JP",
  "PUBLIC_GAME_UI_LIBRARY_KR",
  "PUBLIC_GAME_UI_LIBRARY_EN",
  "PUBLIC_CHART_SITE",
  "PUBLIC_STORY_SITE",
  "PUBLIC_STORY_SITE_JP",
  "PUBLIC_MUSIC_DATA_SITE",
  "PUBLIC_MUSIC_DATA_SITE_JP",
  "PUBLIC_MUSIC_PLAYER_SITE",
  "PUBLIC_CUBISM_CORE",
  "PUBLIC_CUBISM_MOTIONSYNC_CORE",
  "PUBLIC_SPINE_RUNTIME",
  "PUBLIC_GAME_API",
] as const;

/** The `env` map of next.config.ts; the version footer fields are always present. */
export function buildPublicEnv(
  env: Readonly<Record<string, string | undefined>>,
  build: { version: string; revision: string },
): Record<string, string> {
  const values: Record<string, string> = {
    PUBLIC_MOENOTES_VERSION: build.version,
    PUBLIC_MOENOTES_REVISION: build.revision,
  };
  for (const name of PUBLIC_ENV_KEYS) {
    const value = env[name];
    if (value !== undefined) values[name] = value;
  }
  // "" selects the published replay-manifest engine, so an empty value must reach the development bundle.
  if (env.PUBLIC_DECK_RECOMMEND_ENGINE !== undefined) values.PUBLIC_DECK_RECOMMEND_ENGINE = env.PUBLIC_DECK_RECOMMEND_ENGINE;
  return values;
}

/** Set in next.config.ts: the package.json version and the commit the site was built from ("" when unknown). */
declare namespace NodeJS {
  interface ProcessEnv {
    PUBLIC_ASSET_API?: string;
    PUBLIC_RECOGNITION_SITE?: string;
    PUBLIC_GAME_UI_LIBRARY_TW?: string;
    PUBLIC_GAME_UI_LIBRARY_JP?: string;
    PUBLIC_GAME_UI_LIBRARY_KR?: string;
    PUBLIC_GAME_UI_LIBRARY_EN?: string;
    PUBLIC_CHART_SITE?: string;
    PUBLIC_STORY_SITE?: string;
    PUBLIC_STORY_SITE_JP?: string;
    PUBLIC_MUSIC_DATA_SITE?: string;
    PUBLIC_MUSIC_DATA_SITE_JP?: string;
    PUBLIC_MUSIC_PLAYER_SITE?: string;
    PUBLIC_DECK_RECOMMEND_ENGINE?: string;
    PUBLIC_CUBISM_CORE?: string;
    PUBLIC_CUBISM_MOTIONSYNC_CORE?: string;
    PUBLIC_SPINE_RUNTIME?: string;
    PUBLIC_GAME_API?: string;
    PUBLIC_MOENOTES_VERSION?: string;
    PUBLIC_MOENOTES_REVISION?: string;
  }
}

export const storageKeys = {
  settings: "moenotes:settings",
  sidebarOpen: "moenotes:sidebar-open",
  filterDrawerOpen: "moenotes:filter-drawer-open",
  breadcrumbsOpen: "moenotes:breadcrumbs-open",
  filterDrawerHintSeen: "moenotes:filter-drawer-hint-seen",
  browserNoticeDismissed: "moenotes:browser-notice-dismissed",
  scrollPrefix: "moenotes:scroll:",
  assetCacheBypass: "moenotes:asset-cache-bypass",
  chartLiveSettings: "moenotes:chart-live-settings",
  storyPlayerVolumes: "moenotes:story-player-volumes",
  newsSeen: "moenotes:news-seen",
  homeLayout: "moenotes:home-layout:v1",
  accentPalette: "moenotes:accent-palette",
  audioDock: "moenotes:audio-dock:v1",
  /** Shared with the song title preference (src/lib/music/title-preference.ts): "1" / "0". */
  forceJapaneseTitles: "moenotes:force-ja-titles",
} as const;

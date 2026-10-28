export const storageKeys = {
  settings: "moenotes:settings",
  sidebarOpen: "moenotes:sidebar-open",
  /** Which navigation groups the reader folded, as JSON `Record<groupId, boolean>` in local storage. */
  navGroups: "moenotes:nav-groups",
  /** The group the previous page belonged to, so entering a group from outside opens it once (session-scoped). */
  navActiveGroup: "moenotes:nav-active-group",
  /** The desktop drawer's scroll offset, restored across page loads (session-scoped). */
  sidebarScroll: "moenotes:sidebar-scroll",
  /** The last `/api/me` answer ("signed-in" / "signed-out" / "unavailable"), so the drawer's foot paints correctly. */
  accountState: "moenotes:account-state",
  filterDrawerOpen: "moenotes:filter-drawer-open",
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
  /** Shared with spoiler content preference: "1" / "0". */
  showSpoiler: "moenotes:show-spoiler",
  /** Whether developer testing mode for spoiler content is unlocked via ?Spoiler=allow: "1" / "0". */
  spoilerUnlocked: "moenotes:spoiler-unlocked",
  /** Last synchronized MasterData dataVersion fingerprint in browser storage. */
  masterdataVersion: "moenotes:masterdata-version",
  /** Session-scoped cache-bypass flag set during manual MasterData refresh landing. */
  masterdataBypassSession: "moenotes:masterdata-bypass",
  /** Circuit-breaker counter & timestamp preventing infinite manual refresh loops. */
  masterdataRefreshCount: "moenotes:masterdata-refresh-count",
  masterdataRefreshTs: "moenotes:masterdata-refresh-ts",
} as const;

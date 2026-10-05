import { buildEnvOrigin } from "./build-env";
import { gameUiSources } from "./game-ui";

const assetApi = (import.meta.env.PUBLIC_ASSET_API || "https://assets.bdon.moe").replace(/\/+$/, "");
const recognitionSite = (import.meta.env.PUBLIC_RECOGNITION_SITE || "https://storage.bdon.moe/moenotes").replace(/\/+$/, "");
const nativeUi = gameUiSources({
  tw: import.meta.env.PUBLIC_GAME_UI_LIBRARY_TW, jp: import.meta.env.PUBLIC_GAME_UI_LIBRARY_JP,
  kr: import.meta.env.PUBLIC_GAME_UI_LIBRARY_KR, en: import.meta.env.PUBLIC_GAME_UI_LIBRARY_EN,
}, {
  tw: "https://storage.bdon.moe/moenotes/game-ui/tw/0c7f77573ffb33957aa168cfd8816bf2d4a40ec67b87a26f188757a76e5132c2/manifest.json",
  jp: "https://storage.bdon.moe/moenotes/game-ui/jp/07ae20b788d94a6db8111f10614db08072f5edc0ac9630087aefa6e51a2e29b6/manifest.json",
});

export const assetConfig = {
  /**
   * moenotes-assets service: published files by asset path (/{region}/{language}/{key}/{label}.{ext}, see
   * src/lib/assets/release.ts and docs/release-assets.md) and the bundle browser API.
   */
  api: assetApi,
  /**
   * Build-time origin of the same service, e.g. its k3s Service address (`MOENOTES_ASSET_INTERNAL`). The build
   * and the deploy server fetch through it; pages still link to `api`. See docs/deployment.md.
   */
  internal: buildEnvOrigin("MOENOTES_ASSET_INTERNAL"),
  /**
   * ournotes-player chart site (charts/<musicId>_<difficulty>.json + assets/<sha256>.<ext>), published by
   * moenotes-assets at /chart-site/; see docs/chart-preview.md.
   */
  chartSite: (import.meta.env.PUBLIC_CHART_SITE || "https://assets.bdon.moe/chart-site").replace(/\/+$/, ""),
  /**
   * The story site (stories.json + stories/<advId>.json + models/ + assets/), built by the story-site workflow of
   * StarMoe-org/nnnotes into the storage bucket; see docs/story-player.md.
   */
  storySite: (import.meta.env.PUBLIC_STORY_SITE || "https://storage.bdon.moe/moenotes").replace(/\/+$/, ""),
  /**
   * The music data site the chart data tool reads at runtime: `{musicDataSite}/music-data.json` (nnnotes `music-data`,
   * with the ournotes-deck statistics), published into the storage bucket by StarMoe-org/nnnotes workflows like the
   * story site. A new file needs no rebuild of this site.
   */
  musicDataSite: (import.meta.env.PUBLIC_MUSIC_DATA_SITE || "https://storage.bdon.moe/moenotes/music-data").replace(/\/+$/, ""),
  /**
   * The JP music data site, published separately from `musicDataSite` (which the tw, kr and en servers share) by the
   * same workflows: `{musicDataSiteJp}/music-data.json` and `build.json`.
   */
  musicDataSiteJp: (import.meta.env.PUBLIC_MUSIC_DATA_SITE_JP || "https://storage.bdon.moe/moenotes/jp/music-data").replace(/\/+$/, ""),
  /**
   * The deck solver runtime (docs/deck-worker.md). The Worker and its core module are this site's own files
   * (`public/deck/`); the deck data comes from the music data sites. `recommendEngine` is the URL of an engine
   * descriptor that replaces the published `recommendEngine` entry: the engine build this site serves
   * (`public/deck/engine/`), or `PUBLIC_DECK_RECOMMEND_ENGINE`.
   */
  deck: {
    workerUrl: "/deck/deck-worker.js",
    recommendEngine: String(import.meta.env.PUBLIC_DECK_RECOMMEND_ENGINE || "/deck/engine/recommend-engine.json"),
  },
  /** Published prefab sources; TW/KR/EN reuse the international client UI. */
  gameUiLibraries: nativeUi.libraries,
  gameUiLibraryRegions: nativeUi.regions,
  /**
   * Screenshot recognition, shared by every server. The Worker and its modules are served from this site
   * (`public/recognition/`). The recognition site holds `recognition/current.json`, a pointer to the current bundle
   * manifest by SHA-256 and size, and the content-addressed `assets/<sha256>.<ext>` files it lists: the gallery,
   * OpenCV and ONNX Runtime WASM, the field model and the card artwork. A new bundle needs no rebuild of this site.
   * See docs/card-box.md.
   */
  recognition: {
    site: recognitionSite,
    pointerUrl: `${recognitionSite}/recognition/current.json`,
    workerUrl: "/recognition/recognition-worker.js",
  },
  /** Shared song-page modules; published at the storage site's root, beside the music-data directory. */
  musicPlayerSite: (import.meta.env.PUBLIC_MUSIC_PLAYER_SITE || import.meta.env.PUBLIC_STORY_SITE || "https://storage.bdon.moe/moenotes").replace(/\/+$/, ""),
  /**
   * The JP story site, built separately (JP Live2D model ids overlap the international ones): `jp/` of the same bucket.
   * The story player lists both; an episode both have plays from `storySite`. Set `PUBLIC_STORY_SITE_JP` to the
   * `storySite` root to list one site only.
   */
  storySiteJp: (import.meta.env.PUBLIC_STORY_SITE_JP || "https://storage.bdon.moe/moenotes/jp").replace(/\/+$/, ""),
  /**
   * Live2D Cubism Core for Web, which the Live2D viewer loads before a model (ournotes-player does not bundle it; Live2D's
   * own license applies). Override with `PUBLIC_CUBISM_CORE` to serve a copy; see docs/live2d-viewer.md.
   */
  cubismCore: import.meta.env.PUBLIC_CUBISM_CORE || "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
  /**
   * Files of the story player which ournotes-player does not bundle either (each under its maker's license).
   * The CRI Core of Live2D's MotionSync plugin (`live2dcubismmotionsynccore.min.js` 5.0.4, the voices' lip sync on
   * models with a MotionSync controller) is Redistributable Code of the Live2D Proprietary Software License Agreement,
   * served as is from the storage bucket; `PUBLIC_CUBISM_MOTIONSYNC_CORE` points it elsewhere. A Spine 4.2 spine-core
   * build defining the global `spine` (the characters of home spot talks) is optional; unset, stories play without it.
   * See docs/story-player.md.
   */
  motionSyncCore:
    import.meta.env.PUBLIC_CUBISM_MOTIONSYNC_CORE
    || "https://storage.bdon.moe/moenotes/vendor/cubism-motionsync-core-5.0.4/live2dcubismmotionsynccore.min.js",
  /** The license the MotionSync Core comes under, linked from the story player's help dialog. */
  motionSyncLicense: "https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html",
  spineRuntime: import.meta.env.PUBLIC_SPINE_RUNTIME || "",
  /**
   * The asset service's default region (its `region` setting), whose files are also served without the region
   * segment. It is the primary server's region (src/config/servers.ts); other servers' files carry `/{region}`.
   */
  region: "tw",
  fonts: {
    googlePreconnect: "https://fonts.googleapis.com",
    googleStaticPreconnect: "https://fonts.gstatic.com",
    googleDisplay: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Zen+Kurenaido&family=Caveat:wght@400;700&family=Patrick+Hand&display=swap",
    // Only load LXGW WenKai Screen (preferred), Web font is fallback via system font stack
    lxgwWenKaiScreen: "https://cdn.bootcdn.net/ajax/libs/lxgw-wenkai-screen-webfont/1.7.0/style.min.css",
  },
} as const;

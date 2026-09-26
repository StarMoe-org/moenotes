import { buildEnvOrigin } from "./build-env";

export const assetConfig = {
  /**
   * moenotes-assets service: published files by asset path (/{language}/{key}/{label}.{ext}, see
   * src/lib/assets/release.ts and docs/release-assets.md) and the bundle browser API.
   */
  api: (import.meta.env.PUBLIC_ASSET_API || "https://assets.bdon.moe").replace(/\/+$/, ""),
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
  region: "tw",
  fonts: {
    googlePreconnect: "https://fonts.googleapis.com",
    googleStaticPreconnect: "https://fonts.gstatic.com",
    googleDisplay: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Zen+Kurenaido&family=Caveat:wght@400;700&family=Patrick+Hand&display=swap",
    // Only load LXGW WenKai Screen (preferred), Web font is fallback via system font stack
    lxgwWenKaiScreen: "https://cdn.bootcdn.net/ajax/libs/lxgw-wenkai-screen-webfont/1.7.0/style.min.css",
  },
} as const;

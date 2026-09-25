export const assetConfig = {
  /**
   * moenotes-assets service: published files by asset path (/{language}/{key}/{label}.{ext}, see
   * src/lib/assets/release.ts and docs/release-assets.md) and the bundle browser API.
   */
  api: (import.meta.env.PUBLIC_ASSET_API || "https://assets.bdon.moe").replace(/\/+$/, ""),
  region: "tw",
  fonts: {
    googlePreconnect: "https://fonts.googleapis.com",
    googleStaticPreconnect: "https://fonts.gstatic.com",
    googleDisplay: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Zen+Kurenaido&family=Caveat:wght@400;700&family=Patrick+Hand&display=swap",
    // Only load LXGW WenKai Screen (preferred), Web font is fallback via system font stack
    lxgwWenKaiScreen: "https://cdn.bootcdn.net/ajax/libs/lxgw-wenkai-screen-webfont/1.7.0/style.min.css",
  },
} as const;

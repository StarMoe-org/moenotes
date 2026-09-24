export const assetConfig = {
  /** Assets exported from the live client. Object names carry export sequence numbers, so paths resolve through src/lib/assets/generated. */
  releaseSource: "https://storage.bdon.moe/moenotes",
  browserApi: (import.meta.env.PUBLIC_ASSET_BROWSER_API || "https://assets.bdon.moe").replace(/\/+$/, ""),
  browserRegion: "tw",
  fonts: {
    googlePreconnect: "https://fonts.googleapis.com",
    googleStaticPreconnect: "https://fonts.gstatic.com",
    googleDisplay: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Zen+Kurenaido&family=Caveat:wght@400;700&family=Patrick+Hand&display=swap",
    // Only load LXGW WenKai Screen (preferred), Web font is fallback via system font stack
    lxgwWenKaiScreen: "https://cdn.bootcdn.net/ajax/libs/lxgw-wenkai-screen-webfont/1.7.0/style.min.css",
  },
} as const;

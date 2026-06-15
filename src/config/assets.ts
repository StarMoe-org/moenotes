export const assetConfig = {
  sources: {
    main: "https://assets.moesekai.dev/ournotes",
    backup: "https://assets-backup.moesekai.dev/ournotes",
  },
  fonts: {
    googlePreconnect: "https://fonts.googleapis.com",
    googleStaticPreconnect: "https://fonts.gstatic.com",
    googleDisplay: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Zen+Kurenaido&family=Caveat:wght@400;700&family=Patrick+Hand&display=swap",
    // Only load LXGW WenKai Screen (preferred), Web font is fallback via system font stack
    lxgwWenKaiScreen: "https://cdn.bootcdn.net/ajax/libs/lxgw-wenkai-screen-webfont/1.7.0/style.min.css",
  },
} as const;

import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  trailingSlash: "ignore",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
  // NOTE: i18n config here is reserved for future Astro native i18n features.
  // Current routing uses custom catch-all via src/pages/[...locale]/index.astro
  // and locale helpers in src/config/locales.ts. Keep these synchronized if locale changes.
  i18n: {
    defaultLocale: "zh-CN",
    locales: [
      "zh-CN",
      { path: "zh-tw", codes: ["zh-TW"] },
      { path: "ja", codes: ["ja-JP"] },
      { path: "en", codes: ["en-US"] },
      { path: "ko", codes: ["ko-KR"] },
      { path: "th", codes: ["th-TH"] },
      { path: "id", codes: ["id-ID"] },
      { path: "vi", codes: ["vi-VN"] },
    ],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { playerShellPath } from "./src/config/players.ts";

/**
 * `astro dev` serves player pages (/u/{server}/{profileId}) from the locale's /u shell, as the deploy server does
 * (server/static.ts): a static build has no page per player.
 */
function playerPages() {
  return {
    name: "moenotes-player-pages",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = new URL(request.url ?? "/", "http://dev");
        const shell = playerShellPath(url.pathname);
        if (shell) request.url = shell + url.search;
        next();
      });
    },
  };
}

export default defineConfig({
  trailingSlash: "ignore",
  // Story pages spend most of their render time waiting on story-table fetches from our own
  // asset service; rendering several pages at once overlaps that wait.
  build: {
    concurrency: 16,
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss(), playerPages()],
    // `astro dev` forwards the account API like the deploy server does (docs/account.md). Without starmoe-api
    // running the requests fail and the header simply shows no account button.
    server: {
      proxy: {
        "/api": process.env.MOENOTES_API_DEV ?? "http://localhost:8787",
      },
    },
    // The chart renderer worker (src/lib/music/chart-render.worker.ts) is an ES module worker: its Emscripten
    // glue is ESM and locates the .wasm via import.meta.url, which Vite emits as a hashed asset.
    worker: {
      format: "es",
    },
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
          { path: "es", codes: ["es-ES"] },
          { path: "pt", codes: ["pt-BR"] },
          { path: "fr", codes: ["fr-FR"] },
          { path: "de", codes: ["de-DE"] },
          { path: "ru", codes: ["ru-RU"] },
        ],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
});

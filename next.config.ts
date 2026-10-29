import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/** Packages bundled on both server and client (material-color-utilities uses extensionless relative ESM imports). */
const SERVER_BUNDLED = [
  "@material/material-color-utilities",
  "@mui/material",
  "@mui/system",
  "@mui/utils",
  "@mui/styled-engine",
  "@mui/private-theming",
];

function buildInfo(): { version: string; revision: string } {
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version?: string };
  let revision = process.env.MOENOTES_REVISION ?? "";
  if (!revision) {
    try {
      revision = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      revision = "";
    }
  }
  return { version: pkg.version ?? "0.0.0", revision };
}

const info = buildInfo();

const publicEnv: Record<string, string> = {
  PUBLIC_ASSET_API: process.env.PUBLIC_ASSET_API ?? "",
  PUBLIC_RECOGNITION_SITE: process.env.PUBLIC_RECOGNITION_SITE ?? "",
  PUBLIC_GAME_UI_LIBRARY_TW: process.env.PUBLIC_GAME_UI_LIBRARY_TW ?? "",
  PUBLIC_GAME_UI_LIBRARY_JP: process.env.PUBLIC_GAME_UI_LIBRARY_JP ?? "",
  PUBLIC_GAME_UI_LIBRARY_KR: process.env.PUBLIC_GAME_UI_LIBRARY_KR ?? "",
  PUBLIC_GAME_UI_LIBRARY_EN: process.env.PUBLIC_GAME_UI_LIBRARY_EN ?? "",
  PUBLIC_CHART_SITE: process.env.PUBLIC_CHART_SITE ?? "",
  PUBLIC_STORY_SITE: process.env.PUBLIC_STORY_SITE ?? "",
  PUBLIC_STORY_SITE_JP: process.env.PUBLIC_STORY_SITE_JP ?? "",
  PUBLIC_MUSIC_DATA_SITE: process.env.PUBLIC_MUSIC_DATA_SITE ?? "",
  PUBLIC_MUSIC_DATA_SITE_JP: process.env.PUBLIC_MUSIC_DATA_SITE_JP ?? "",
  PUBLIC_MUSIC_PLAYER_SITE: process.env.PUBLIC_MUSIC_PLAYER_SITE ?? "",
  PUBLIC_CUBISM_CORE: process.env.PUBLIC_CUBISM_CORE ?? "",
  PUBLIC_CUBISM_MOTIONSYNC_CORE: process.env.PUBLIC_CUBISM_MOTIONSYNC_CORE ?? "",
  PUBLIC_SPINE_RUNTIME: process.env.PUBLIC_SPINE_RUNTIME ?? "",
  PUBLIC_GAME_API: process.env.PUBLIC_GAME_API ?? "",
  PUBLIC_MOENOTES_VERSION: info.version,
  PUBLIC_MOENOTES_REVISION: info.revision,
};

if (process.env.PUBLIC_DECK_RECOMMEND_ENGINE !== undefined) {
  publicEnv.PUBLIC_DECK_RECOMMEND_ENGINE = process.env.PUBLIC_DECK_RECOMMEND_ENGINE;
}

const BROWSER_EMPTY_SHIM = "./src/lib/build/browser-empty-shim.ts";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheMaxMemorySize: 50 * 1024 * 1024,
  poweredByHeader: false,
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
  transpilePackages: SERVER_BUNDLED,
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  env: publicEnv,
  turbopack: {
    resolveAlias: {
      "node:fs": { browser: BROWSER_EMPTY_SHIM },
      "node:path": { browser: BROWSER_EMPTY_SHIM },
      "node:url": { browser: BROWSER_EMPTY_SHIM },
      "node:module": { browser: BROWSER_EMPTY_SHIM },
      "node:crypto": { browser: BROWSER_EMPTY_SHIM },
      fs: { browser: BROWSER_EMPTY_SHIM },
      path: { browser: BROWSER_EMPTY_SHIM },
      url: { browser: BROWSER_EMPTY_SHIM },
      module: { browser: BROWSER_EMPTY_SHIM },
      crypto: { browser: BROWSER_EMPTY_SHIM },
      "@/lib/route/masterdata-params": { browser: BROWSER_EMPTY_SHIM },
    },
  },
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      // Strip `node:` URI scheme for Emscripten's dead-code `if (ENVIRONMENT_IS_NODE)` guards in browser/worker bundles,
      // and keep server-only MasterData staticParams loaders out of client navigation chunks.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        url: false,
        module: false,
        crypto: false,
      };
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.resolve(process.cwd(), "src/lib/route/masterdata-params.ts")]: false,
        [path.resolve(process.cwd(), "src/lib/route/masterdata-params")]: false,
      };
    }
    return config;
  },
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    // Prevent reverse proxies / CDNs in dev preview environments from caching unhashed `/_next/static/chunks/app/*.js`.
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, must-revalidate" },
          { key: "CDN-Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  async rewrites() {
    const apiDev = process.env.MOENOTES_API_DEV?.trim();
    if (!apiDev) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiDev.replace(/\/+$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { buildPublicEnv } from "./src/config/public-env";

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

const publicEnv = buildPublicEnv(process.env, info);

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
        headers: [{ key: "CDN-Cache-Control", value: "no-store" }],
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

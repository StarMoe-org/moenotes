/**
 * MoeNotes deploy server. Serves the live build from the data volume and rebuilds the site in the background
 * whenever the asset service publishes a new release or a new image brings changed code. A failed build never
 * replaces the live one.
 *
 *   bun server/main.ts               run (docs/deployment.md)
 *   bun server/main.ts --self-check  offline smoke test; the Dockerfile runs it so a broken server fails the image
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isApiPath, parseApiOrigin, proxyApi } from "./api-proxy";
import { BuildStore, astroCli, errorMessage, log } from "./builds";
import { config } from "./config";
import { compressSite, linkSite } from "./finalize";
import { playerShellPath } from "../src/config/players";
import { servePlayerPage } from "./player-meta";
import { serveStatic, type SiteRoots } from "./static";
import { assetExportLag, buildKey, describeData, fetchJson, sourceRevision, type AssetManifest, type DataVersion } from "./upstream";

const RETRY_BASE_MS = 10 * 60 * 1000;
const RETRY_MAX_MS = 3 * 60 * 60 * 1000;

interface Scheduler {
  building: { data: string; startedAt: string } | null;
  /** Error text stays in the logs: it can name in-cluster hosts. */
  failure: { key: string; attempts: number; at: string; retryAt: number } | null;
  waiting: { key: string; since: number; reason: string } | null;
  lastCheck: { at: string; ok: boolean } | null;
}

if (process.argv.includes("--self-check")) {
  await selfCheck();
  process.exit(0);
}

const store = new BuildStore(config);
await store.load();
const scheduler: Scheduler = { building: null, failure: null, waiting: null, lastCheck: null };
let revision = "";
let stopping = false;

// Listen before anything slow: the previous build is served while cleanup and the first check run.
const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/healthz") return new Response("ok\n");
    if (pathname === "/readyz") return new Response(store.current ? "ready\n" : "no build yet\n", { status: store.current ? 200 : 503 });
    if (pathname === "/_moenotes/status") return Response.json(status(), { headers: { "cache-control": "no-store" } });
    // The account API works before the first build too: it does not depend on the site output.
    if (isApiPath(pathname)) return proxyApi(request, config.apiInternal.origin);
    if (playerShellPath(pathname)) return servePlayerPage(request, store.roots, config.apiInternal.origin);
    return serveStatic(request, store.roots, store.current?.stage ?? "full");
  },
  error(error) {
    log(`request failed: ${errorMessage(error)}`);
    return new Response("Internal Server Error\n", { status: 500 });
  },
});
log(`listening on ${server.url}; ${store.current ? `serving ${store.current.id} (${store.current.data})` : "no build yet"}`);
if (config.apiInternal.invalid) {
  log("MOENOTES_API_INTERNAL is not an absolute http(s) URL (e.g. https://api.star.moe); /api/* is disabled");
} else if (config.apiInternal.origin) {
  log(`forwarding /api/* to ${config.apiInternal.origin}`);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log(`${signal}: shutting down`);
    store.stopProcesses();
    void server.stop(true).finally(() => process.exit(0));
  });
}

void schedule();

function status() {
  return {
    ready: Boolean(store.current),
    revision,
    current: store.current,
    /** Rollout phase of the live build: only the five core locales on "core", all supported on "full". */
    stage: store.current?.stage ?? null,
    localesRendered: store.current?.localesRendered ?? null,
    pendingRest: store.current?.pendingRest ?? false,
    buildMode: config.buildMode,
    splitLocales: config.buildMode === "local" && config.splitLocales,
    building: scheduler.building && { ...scheduler.building, ...store.progress?.toJSON() },
    compressing: store.compressing,
    waiting: scheduler.waiting && { reason: scheduler.waiting.reason, since: new Date(scheduler.waiting.since).toISOString() },
    failure: scheduler.failure && { ...scheduler.failure, retryAt: new Date(scheduler.failure.retryAt).toISOString() },
    lastCheck: scheduler.lastCheck,
  };
}

async function schedule(): Promise<void> {
  // Before the first build: cleanup removes staging directories.
  await store.cleanUp().catch((error: unknown) => log(`cleanup failed: ${errorMessage(error)}`));
  revision = await sourceRevision(config.appDir);
  log(`source revision ${revision}; watching ${config.assetVersionUrl} every ${config.pollMs / 1000}s`);
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      scheduler.lastCheck = { at: new Date().toISOString(), ok: false };
      log(`version check failed: ${errorMessage(error)}`);
    }
    await Bun.sleep(config.pollMs);
  }
}

async function tick(): Promise<void> {
  const manifest = await fetchJson<AssetManifest>(config.assetVersionUrl);
  scheduler.lastCheck = { at: new Date().toISOString(), ok: true };
  const data = describeData(manifest);
  const key = buildKey(revision, data, config.buildMode === "github" ? config.githubCommit : undefined);
  // Apply backoff before the core-resume branch as well as new builds.
  if (scheduler.failure?.key === key && Date.now() < scheduler.failure.retryAt) return;
  if (store.current?.key === key) {
    scheduler.waiting = null;
    // Local mode still resumes an interrupted split rollout, but only after the failure backoff.
    if (store.current.pendingRest && (config.buildMode === "github" || config.splitLocales)) {
      log(`resuming the interrupted full build for ${store.current.id} (stage=core)`);
      await runBuild(key, data);
    }
    return;
  }

  const lag = await assetExportLag(manifest, config.masterdataVersionUrl);
  if (lag) {
    const since = scheduler.waiting?.key === key ? scheduler.waiting.since : Date.now();
    if (scheduler.waiting?.reason !== lag) log(`waiting to build ${data.label}: ${lag}`);
    scheduler.waiting = { key, since, reason: lag };
    if (config.buildMode === "github" || Date.now() - since < config.syncWaitMs) return;
    log(`the asset export has not caught up after ${config.syncWaitMs / 60_000} min; building anyway`);
  }
  scheduler.waiting = null;
  await runBuild(key, data);
}

async function runBuild(key: string, data: DataVersion): Promise<void> {
  scheduler.building = { data: data.label, startedAt: new Date().toISOString() };
  try {
    const record = await store.build(key, revision, data);
    // Do not install an artifact for superseded data after a long queue/build/download.
    if (config.buildMode === "github") {
      const latest = await fetchJson<AssetManifest>(config.assetVersionUrl);
      if (describeData(latest).fingerprint !== data.fingerprint || await assetExportLag(latest, config.masterdataVersionUrl)) {
        throw new Error("Release data changed while waiting for CI; keeping the live build until the next version is ready");
      }
    }
    if (stopping) return;
    // A split-locale local rollout already activates core inside build(); CI installs all locales together.
    await store.activate(record);
    scheduler.failure = null;
    log(`build ${record.id} is live after ${Math.round(record.durationMs / 1000)}s (${record.pages} pages, stage=${record.stage ?? "full"}); compressing it in the background`);
  } catch (error) {
    if (stopping) return;
    const attempts = scheduler.failure?.key === key ? scheduler.failure.attempts + 1 : 1;
    const delay = Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS);
    scheduler.failure = { key, attempts, at: new Date().toISOString(), retryAt: Date.now() + delay };
    const serving = store.current ? `still serving ${store.current.id}` : "nothing to serve yet";
    log(`build failed (attempt ${attempts}, next in ${delay / 60_000} min, ${serving}): ${errorMessage(error)}`);
    return;
  } finally {
    scheduler.building = null;
  }
  await store.prune().catch((error: unknown) => log(`prune failed: ${errorMessage(error)}`));
}

async function selfCheck(): Promise<void> {
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`self-check failed: ${message}`);
  };
  await astroCli(config.appDir);
  log(`self-check: source revision ${await sourceRevision(config.appDir)}`);

  const dir = await mkdtemp(join(tmpdir(), "moenotes-self-check-"));
  try {
    const page = `<!doctype html><title>check</title>${"<p>moenotes</p>".repeat(200)}`;
    const writeSite = async (site: string) => {
      await Bun.write(join(site, "index.html"), page);
      await Bun.write(join(site, "music", "1", "index.html"), page);
      await Bun.write(join(site, "u", "index.html"), page);
      await Bun.write(join(site, "ja", "u", "index.html"), page);
      await Bun.write(join(site, "404.html"), "<!doctype html><title>404</title>");
      await Bun.write(join(site, "_astro", "app.js"), "console.log(1);".repeat(200));
    };
    const previous = join(dir, "previous");
    const current = join(dir, "current");
    await writeSite(previous);
    await Bun.write(join(previous, "_astro", "old.js"), "console.log(0);");
    await Bun.write(join(previous, ".prerender", "entry.mjs"), "export {};");
    await writeSite(current);

    const first = await linkSite(previous);
    check(first.linked === 0 && first.files === 7, `expected 7 files and nothing linked, got ${first.files} / ${first.linked} linked`);
    check(!await Bun.file(join(previous, ".prerender", "entry.mjs")).exists(), "finalize should drop .prerender/");

    let roots: SiteRoots = { current: previous, previous: [] };
    const get = (path: string, headers: Record<string, string> = {}, method = "GET") =>
      serveStatic(new Request(`http://self-check${path}`, { headers, method }), roots);

    // Live before its compression: served as is until the variants exist.
    const uncompressed = await get("/", { "accept-encoding": "gzip, br" });
    check(uncompressed.status === 200 && !uncompressed.headers.has("content-encoding"), "a build without variants should be served as is");
    await Bun.write(join(previous, "index.html.br.tmp-1"), "partial");
    const compressed = await compressSite(previous);
    check(compressed.compressed === 5, `expected 5 compressed files, got ${compressed.compressed}`);
    check(!await Bun.file(join(previous, "index.html.br.tmp-1")).exists(), "compress should drop an interrupted run's temporary files");
    check((await compressSite(previous)).compressed === 0, "a second compression should find nothing to do");
    await rm(join(previous, "index.html.gz"));
    check((await compressSite(previous)).compressed === 1, "compress should complete a file an interrupted run left with one variant");

    const second = await linkSite(current, { site: previous, manifest: first.manifest });
    check(second.linked === 6, `expected 6 linked files, got ${second.linked}`);
    check((await compressSite(current)).compressed === 0, "linked files should come with the live build's variants");

    roots = { current, previous: [previous] };
    const home = await get("/", { "accept-encoding": "gzip, br" });
    check(home.status === 200 && home.headers.get("content-encoding") === "br", "GET / should serve the brotli variant");
    const etag = home.headers.get("etag") ?? "";
    check((await get("/", { "accept-encoding": "br", "if-none-match": etag })).status === 304, "matching ETag should answer 304");
    const pageVersion = home.headers.get("server-timing") ?? "";
    check(/^page;desc="[0-9a-z]+-[0-9a-z]+"$/.test(pageVersion), "HTML should carry its page version");
    check((await get("/", { "accept-encoding": "identity" })).headers.get("server-timing") === pageVersion, "the page version should not depend on the encoding");
    roots = { current: previous, previous: [] };
    check((await get("/")).headers.get("server-timing") === pageVersion, "a page linked unchanged into a new build should keep its version");
    roots = { current, previous: [previous] };
    check((await get("/music/1")).status === 200, "GET /music/1 should serve music/1/index.html");
    check((await get("/music/1", {}, "HEAD")).status === 200, "HEAD should be served");
    check((await get("/missing")).status === 404, "unknown paths should answer 404");
    check((await get("/u/tw/21139118822")).status === 200, "a player page should serve the /u/ shell");
    check((await get("/ja/u/jp/59336778464/")).status === 200, "a localized player page should serve that locale's shell");
    check((await get("/u/tw/31139118822")).status === 404, "an ID that cannot be on the server is not a player page");
    check((await get("/xx/u/tw/21139118822")).status === 404, "an unknown locale prefix is not a player page");
    check((await get("/%2e%2e/%2e%2e/etc/hostname")).status === 404, "paths must stay inside the site");
    const script = await get("/_astro/app.js");
    check(script.headers.get("cache-control")?.includes("immutable") === true, "/_astro/ should be immutable");
    check(!script.headers.has("server-timing"), "only HTML should carry a page version");
    check((await get("/_astro/old.js")).status === 200, "/_astro/ should fall back to earlier builds");
    check((await serveStatic(new Request("http://self-check/"), { current: null, previous: [] })).status === 503, "no build should answer 503");

    // /api relay: status, redirect, every Set-Cookie and the request body pass through.
    check((await proxyApi(new Request("http://self-check/api/me"), undefined)).status === 404, "/api without MOENOTES_API_INTERNAL should answer 404");
    check(parseApiOrigin("https://api.star.moe/").origin === "https://api.star.moe", "an https origin should be accepted");
    check(parseApiOrigin("http://starmoe-api.moenotes.svc.cluster.local:8080").origin === "http://starmoe-api.moenotes.svc.cluster.local:8080", "an in-cluster origin should be accepted");
    for (const bad of ["passport.bdon.moe", "ftp://api.star.moe", "/api"]) {
      const parsed = parseApiOrigin(bad);
      check(parsed.invalid && parsed.origin === undefined, `"${bad}" should be refused as MOENOTES_API_INTERNAL`);
    }
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const headers = new Headers({ location: "/after", "x-echo": `${request.headers.get("cookie")}|${await request.text()}` });
        headers.append("set-cookie", "a=1; Path=/");
        headers.append("set-cookie", "b=2; Path=/");
        return new Response(null, { status: 303, headers });
      },
    });
    try {
      const relayed = await proxyApi(
        new Request("http://self-check/api/auth/logout?x=1", { method: "POST", headers: { cookie: "s=1" }, body: "hello" }),
        upstream.url.origin,
      );
      check(relayed.status === 303 && relayed.headers.get("location") === "/after", "the proxy should pass redirects through");
      check(relayed.headers.getSetCookie().length === 2, "the proxy should keep every Set-Cookie");
      check(relayed.headers.get("x-echo") === "s=1|hello", "the proxy should forward cookies and the body");
    } finally {
      await upstream.stop(true);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  log("self-check passed");
}

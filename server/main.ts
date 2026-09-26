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
import { BuildStore, astroCli, errorMessage, log } from "./builds";
import { config } from "./config";
import { finalizeSite } from "./finalize";
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
    return serveStatic(request, store.roots);
  },
  error(error) {
    log(`request failed: ${errorMessage(error)}`);
    return new Response("Internal Server Error\n", { status: 500 });
  },
});
log(`listening on ${server.url}; ${store.current ? `serving ${store.current.id} (${store.current.data})` : "no build yet"}`);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log(`${signal}: shutting down`);
    store.stopActiveProcess();
    void server.stop(true).finally(() => process.exit(0));
  });
}

void schedule();

function status() {
  return {
    ready: Boolean(store.current),
    revision,
    current: store.current,
    building: scheduler.building,
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
  const key = buildKey(revision, data);
  if (store.current?.key === key) {
    scheduler.waiting = null;
    return;
  }
  if (scheduler.failure?.key === key && Date.now() < scheduler.failure.retryAt) return;

  const lag = await assetExportLag(manifest, config.masterdataVersionUrl);
  if (lag) {
    const since = scheduler.waiting?.key === key ? scheduler.waiting.since : Date.now();
    if (scheduler.waiting?.reason !== lag) log(`waiting to build ${data.label}: ${lag}`);
    scheduler.waiting = { key, since, reason: lag };
    if (Date.now() - since < config.syncWaitMs) return;
    log(`the asset export has not caught up after ${config.syncWaitMs / 60_000} min; building anyway`);
  }
  scheduler.waiting = null;
  await runBuild(key, data);
}

async function runBuild(key: string, data: DataVersion): Promise<void> {
  scheduler.building = { data: data.label, startedAt: new Date().toISOString() };
  try {
    const record = await store.build(key, revision, data);
    await store.activate(record);
    scheduler.failure = null;
    log(`build ${record.id} is live after ${Math.round(record.durationMs / 1000)}s`);
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
      await Bun.write(join(site, "404.html"), "<!doctype html><title>404</title>");
      await Bun.write(join(site, "_astro", "app.js"), "console.log(1);".repeat(200));
    };
    const previous = join(dir, "previous");
    const current = join(dir, "current");
    await writeSite(previous);
    await Bun.write(join(previous, "_astro", "old.js"), "console.log(0);");
    await Bun.write(join(previous, ".prerender", "entry.mjs"), "export {};");
    await writeSite(current);

    const first = await finalizeSite(previous);
    check(first.compressed === 3, `expected 3 compressed files, got ${first.compressed}`);
    check(!await Bun.file(join(previous, ".prerender", "entry.mjs")).exists(), "finalize should drop .prerender/");
    const second = await finalizeSite(current, { site: previous, manifest: first.manifest });
    check(second.linked === 4 && second.compressed === 0, `expected 4 linked files, got ${second.linked} linked / ${second.compressed} compressed`);

    const roots: SiteRoots = { current, previous: [previous] };
    const get = (path: string, headers: Record<string, string> = {}, method = "GET") =>
      serveStatic(new Request(`http://self-check${path}`, { headers, method }), roots);

    const home = await get("/", { "accept-encoding": "gzip, br" });
    check(home.status === 200 && home.headers.get("content-encoding") === "br", "GET / should serve the brotli variant");
    const etag = home.headers.get("etag") ?? "";
    check((await get("/", { "accept-encoding": "br", "if-none-match": etag })).status === 304, "matching ETag should answer 304");
    check((await get("/music/1")).status === 200, "GET /music/1 should serve music/1/index.html");
    check((await get("/music/1", {}, "HEAD")).status === 200, "HEAD should be served");
    check((await get("/missing")).status === 404, "unknown paths should answer 404");
    check((await get("/%2e%2e/%2e%2e/etc/hostname")).status === 404, "paths must stay inside the site");
    const script = await get("/_astro/app.js");
    check(script.headers.get("cache-control")?.includes("immutable") === true, "/_astro/ should be immutable");
    check((await get("/_astro/old.js")).status === 200, "/_astro/ should fall back to earlier builds");
    check((await serveStatic(new Request("http://self-check/"), { current: null, previous: [] })).status === 503, "no build should answer 503");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  log("self-check passed");
}

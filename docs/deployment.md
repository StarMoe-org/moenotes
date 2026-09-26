# Deployment

The image (`Dockerfile`) holds the Bun runtime and the site sources; it does not contain a built site. The
container runs `server/main.ts`, which:

1. serves the live build from the `/data` volume right away (before any network access), and
2. rebuilds the site in the background whenever the asset service publishes a new release or the image
   brings changed code, then swaps the new build in atomically.

A failed build never replaces the live one: the site keeps serving the previous build and the failure is
retried later. On Zeabur every commit produces a new image; the restarted container serves the previous
build as soon as it listens and rebuilds with the new code behind it.

```bash
docker build -t moenotes .
docker run -p 8080:80 -v moenotes-data:/data \
  -e MOENOTES_ASSET_INTERNAL=http://moenotes-assets.moenotes.svc.cluster.local:8080 \
  -e MOENOTES_MASTERDATA_INTERNAL=http://moenotes-metadata.moenotes.svc.cluster.local:8080 \
  moenotes
```

Mount a persistent volume at `/data` (plan for 10 GB or more; see [Disk](#disk)). Without one, every restart
starts from an empty site and answers 503 until the first build (about 10 minutes) finishes. Run one replica:
the builds and their state on the volume belong to a single server. TLS terminates in front of the
container (Ingress, Cloudflare); the server speaks plain HTTP.

Locally: `MOENOTES_DATA_DIR=../moenotes-data PORT=8080 bun run start`.

## When it rebuilds

Every `MOENOTES_POLL_SECONDS` the server reads the asset service's `versions/current_version.json`. That
file only changes once a release has been exported (`regions.{id}` is the latest succeeded/partial release),
so every story table and image the new MasterData refers to is already published. MasterData's own version
is not a trigger: it moves first, and building on it would render pages whose files are not exported yet.

The build key hashes, per region, `resource_version`, `master_version` and every locale's `snapshot` (a
content hash, so a re-export counts too), together with the source revision: the files under `src/` and
`public/`, `bun.lock`, the build config and all `PUBLIC_*` variables. When the key differs from the live
build's, a build is due. It waits while the export has not caught up with MasterData, that is while
`pending` lists a running release or the metadata service's `current_version.json` reports a newer version
than the release's `master_version`, for at most `MOENOTES_SYNC_WAIT_SECONDS`.

A failed build is retried after 10 minutes, doubling up to 3 hours; a new release or image retries at once.
The build runs `astro build` (no `astro check`) with the same environment as the server. It runs from the
staging directory with `--root` pointing at the image's project: with an `--outDir` outside its working
directory Astro keeps intermediate output in `<cwd>/.astro/` and renames it into the output, which fails with
`EXDEV` when the volume is a different filesystem than the image.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `MOENOTES_ASSET_INTERNAL` | _(unset)_ | In-cluster origin of the asset service, e.g. its k3s Service address |
| `MOENOTES_MASTERDATA_INTERNAL` | _(unset)_ | In-cluster origin of the metadata service |
| `MOENOTES_DATA_DIR` | `/data` | Volume for builds, logs, state and caches |
| `PORT` / `HOST` | `80` / `0.0.0.0` | Listen address |
| `MOENOTES_POLL_SECONDS` | `60` | Release manifest poll interval |
| `MOENOTES_SYNC_WAIT_SECONDS` | `7200` | Longest wait for the export to catch up with MasterData |
| `MOENOTES_BUILD_TIMEOUT_SECONDS` | `3600` | A build step running longer is stopped and counts as failed |
| `MOENOTES_KEEP_BUILDS` | `4` | Builds kept on disk (see [Disk](#disk)) |
| `MOENOTES_VERSION_URL` | _(asset service)_`/versions/current_version.json` | Override of the release manifest URL |
| `PUBLIC_ASSET_API`, `PUBLIC_CHART_SITE` | public origins | Public URLs written into pages (`src/config/assets.ts`) |

### In-cluster origins

`MOENOTES_ASSET_INTERNAL` and `MOENOTES_MASTERDATA_INTERNAL` (`src/config/assets.ts`,
`src/config/masterdata.ts`) replace the public origins for every request the build and the server make
themselves: MasterData tables, story tables and both version manifests. They go through
`src/lib/build/fetch.ts`, which rewrites `https://assets.bdon.moe/...` to `<MOENOTES_ASSET_INTERNAL>/...` and
each MasterData source to `<MOENOTES_MASTERDATA_INTERNAL>/...`. The internal origin must serve the same paths
as the public one. Pages keep linking to the public URLs; browsers never see the internal addresses, which
are read from the process environment only.

There is no fallback to the public origin: a wrong internal address fails the build (with the address in the
log) and the live build stays.

## Caching across builds

Astro renders every page on every build; what carries over between versions is the I/O around rendering.

- **Upstream responses.** Builds store MasterData and story table responses in `/data/cache/fetch` with their
  ETag and revalidate them on the next build, so tables that did not change since the previous version
  answer 304 instead of transferring again. The cache key leaves out the `v` cache-busting parameter. The
  build log ends with `[build-fetch] N unchanged (304), M downloaded`. Deleting the directory is always safe.
- **Output.** `server/finalize.ts` compares each output file with the live build (size and SHA-256 from
  `files.json`). Identical files are hard-linked to the live build's copy together with its compressed
  variants; only changed files take new disk space and are compressed (brotli quality 9 and gzip level 9,
  roughly 70 and 120 MB/s). Linked files keep their mtime, and with it their ETag.

## Serving

`server/static.ts` serves the Astro output like the former Caddy setup: `{path}`, `{path}/index.html`,
`{path}.html`, else `/404.html` with status 404. `/_astro/*` is content-hashed and sent with
`Cache-Control: public, max-age=31536000, immutable`; files missing from the live build are looked up in the
earlier builds kept on disk, so a page loaded just before a swap still finds its scripts. Everything else is
`no-cache` with an ETag. Compressible files are sent as their precompressed `.br` / `.gz` variant when the
client accepts it.

| Endpoint | Answer |
| --- | --- |
| `/healthz` | 200 while the process runs (liveness; use this for platform health checks) |
| `/readyz` | 200 once a build is live, 503 before |
| `/_moenotes/status` | JSON: live build, source revision, build in progress (step, `pages` rendered, `expectedPages`), wait reason, last failure, last check |

Before the first build completes every site path answers 503 with `Retry-After: 60`.

## Disk

```text
/data/state.json               live build record
/data/builds/<id>/site/        web root: Astro output + .br/.gz variants
/data/builds/<id>/files.json   size + SHA-256 per file for the next finalize
/data/builds/.staging-<id>/    build in progress (removed on failure and at startup)
/data/logs/<id>.log            full output of the last 10 attempts
/data/logs/latest.log          link to the newest attempt's log (running or finished)
/data/cache/fetch/             upstream response cache
```

A full build is about 2.4 GB of output plus about 0.7 GB of compressed variants. `MOENOTES_KEEP_BUILDS`
counts the live build, the previous build in full (hard links make it cost only the files that changed) and
older builds reduced to their `_astro/` directory. A build in progress needs room for its own new files.

## Operations

- **Force a rebuild** without new data or code: set `current.key` in `/data/state.json` to `""` and restart.
  The live build keeps serving until the new one is ready.
- **Logs**: the container prints the server's decisions and Astro's output without the per-page lines;
  `/data/logs/<id>.log` has everything, and `/data/logs/latest.log` always names the newest attempt
  (`tail -F /data/logs/latest.log` follows the next build too).
- **Progress**: while a build runs the container prints a line every 30 s, e.g.
  `build 20260926T080000Z-ab12cd34: astro build, 5230/~15773 pages (33%), 4m10s elapsed, rendering done in ~8m`.
  The expected total is the live build's page count (its sitemap entries for a build recorded before pages
  were counted), so it is an estimate: a release that adds pages runs past it, and the percentage stops at
  99 until Astro finishes. Without a live build only the count is shown. `/_moenotes/status` reports the
  same numbers under `building`.

# Deployment

The image (`Dockerfile`) holds one static Go binary, `moenotes` (sources in `server/`), and the source digest of the
site sources it was built from. It contains neither Bun nor the site sources nor a built site. The container runs
`moenotes serve`, which:

1. serves the live build from the `/data` volume right away (before any network access), and
2. dispatches the repository's GitHub Actions site build whenever the asset service publishes a new release or the
   image brings changed site sources, downloads the verified GitHub Release, then swaps it in atomically.

**Rendering runs on GitHub-hosted runners, never in the serving container.** Missing credentials, CI failure,
invalid artifacts or network errors leave the previous site running. A failed build never replaces the live one:
the site keeps serving the previous build and the failure is retried later. On Zeabur every commit produces a new
image; the restarted container serves the previous build as soon as it listens and installs the new one behind it.

```bash
docker build --build-arg MOENOTES_REVISION=$(git rev-parse HEAD) -t moenotes .
docker run -p 8080:80 -v moenotes-data:/data \
  -e MOENOTES_GITHUB_TOKEN \
  -e MOENOTES_ASSET_INTERNAL=http://moenotes-assets.moenotes.svc.cluster.local:8080 \
  -e MOENOTES_MASTERDATA_INTERNAL=http://moenotes-metadata.moenotes.svc.cluster.local:8080 \
  moenotes
```

Mount a persistent volume at `/data` (plan for 10 GB or more; see [Disk](#disk)). Without one, every restart
starts from an empty site and answers 503 until the first build is installed. Run one replica: the builds and their
state on the volume belong to a single server. TLS terminates in front of the container (Ingress, Cloudflare); the
server speaks plain HTTP.

Locally, against a source checkout:

```bash
cd server
MOENOTES_APP_DIR=.. MOENOTES_DATA_DIR=../../moenotes-data PORT=8080 MOENOTES_REVISION=$(git rev-parse HEAD) \
  go run ./cmd/moenotes serve
```

`MOENOTES_APP_DIR` makes the server compute the source digest from the checkout; the image ships it as
`/app/source-digest` instead (`MOENOTES_SOURCE_DIGEST_FILE`). To render the site on a workstation use `bun run build`
or `astro dev`; the deploy server has no local build mode.

The footer shows the site version (`package.json`) and the commit the build comes from. The image has no `.git`,
so the commit comes from the `MOENOTES_REVISION` build argument; on Zeabur it defaults to `ZEABUR_GIT_COMMIT_SHA`.

## Commands

| Command | Purpose |
| --- | --- |
| `moenotes serve` | The deploy server (default command of the image) |
| `moenotes self-check` | Offline smoke test: packs and installs an artifact, links and compresses a build, serves it and relays `/api`. The image build and CI run it |
| `moenotes pack <site> <out>` | Writes the Release parts of a rendered site and prints their summary as JSON (used by the Actions build) |
| `moenotes source-digest [<checkout>]` | Prints the source digest of a checkout (used by the image build) |

The Go module needs Go 1.25 or later. `bun run lint` checks that `server/internal/siteconfig/site.json` matches
`src/config` (locales, player page rules, public data origins); regenerate it with `bun run gen:server-config` after
changing those. CI runs `gofmt`, `go vet`, `go test ./...` and the self-check.

## When it rebuilds

Every `MOENOTES_POLL_SECONDS` the server reads the asset service's `versions/current_version.json`. That
file only changes once a release has been exported (`regions.{id}` is the latest succeeded/partial release),
so every story table and image the new MasterData refers to is already published. MasterData's own version
is not a trigger: it moves first, and building on it would render pages whose files are not exported yet.

The build key hashes the source revision, the exported data and the image commit:

- **Source revision**: the source digest (SHA-256 over `src/`, `public/`, `bun.lock` and the build config, computed
  at image build time) combined with every `PUBLIC_*` variable, which pages inline.
- **Data fingerprint**: per region, `resource_version`, `master_version` and every locale's `snapshot` (a content
  hash, so a re-export counts too).
- **Commit**: `MOENOTES_REVISION`, the exact commit Actions checks out.

When the key differs from the live build's, a build is due. It waits while the export has not caught up with
MasterData, that is while `pending` lists a running release or the metadata service's `current_version.json`
reports a newer version than the release's `master_version`. Only regions that already have an exported release
count: a build shows a game server once its region's first release is exported ([servers.md](servers.md)), so that
release neither holds back builds nor leaves pages without files, and its completion is a new build key.

`scripts/site-data.ts` computes the same values for the Actions build; `tests/site-data.test.ts` keeps both sides in
agreement.

### GitHub Actions and Release

1. Merge `.github/workflows/build-site.yml` into `main` **before** deploying the new image. GitHub must know
   this workflow on the default branch before it can be dispatched. Deploy an image built from that commit;
   `MOENOTES_REVISION` must be its full 40-character Git commit SHA.
2. Create a fine-grained GitHub token restricted to **StarMoe-org/moenotes**, with **Actions: read and write**
   and **Contents: read** (plus the automatically granted Metadata: read). Store it only in the hosting platform's
   secret/environment configuration as `MOENOTES_GITHUB_TOKEN`; do not commit it, put it in `PUBLIC_*`, or paste it
   in logs.
3. Once exported assets and MasterData agree, the server dispatches the workflow with the build key, source
   revision, exact image commit, data fingerprint and **only** `PUBLIC_*` build settings. CI checks out that commit
   and builds all 13 locales in one run. It validates the source revision and checks the data version before and
   after rendering; changing data fails the attempt instead of publishing a mislabeled artifact.
4. CI packs the output with the Go packer and publishes it as a `site-<key>` prerelease, separate from `v*`
   software releases (see [Artifact format](#artifact-format)). Upload happens in a draft; only a complete,
   re-downloaded and verified set is published. An already-published release is immutable and reused. The rendering
   job has read-only permissions; only the publishing job gets `contents: write`.
5. The server polls Actions and the Release, downloads the parts without its GitHub token (only `https:` URLs of this
   repository's Release, redirects to HTTPS only), verifies every part's size and SHA-256 and the whole stream's,
   and extracts it into a staging directory. It links unchanged files, rechecks that upstream data has not moved,
   then activates all languages together. Existing compression, rollback files and old `_astro` assets remain.

A server restart reconciles `/data/github-build.json` with active Actions runs before dispatching again.
Failures use a 10-minute-to-3-hour retry backoff. Cancellation/timeout does not delete a running CI job; the next
attempt finds it or its finished Release. Workflow logs and `/usr/bin/time` memory measurements are on the
repository's Actions page; server logs show polling, validation and installation progress.

Release assets and Actions inputs/logs in this public repository are public. `PUBLIC_*` must contain public
configuration only. Internal service origins remain useful for the server's version checks but are never forwarded
to CI. CI needs the public data endpoints reachable.

Actions caches upstream fetch responses between runs. The first run has a cold cache; cache eviction is normal.

Site prereleases are **not automatically deleted**, to avoid deleting an in-flight download or needed retry.
Keep current and recent `site-*` releases; delete older ones manually only when no deployment is waiting for them.
Do not delete `v*` releases or repurpose a published `site-*` tag.

### Artifact format

A `site-<key>` Release holds `site-manifest.json` and the parts `site.tar.zst.000`, `site.tar.zst.001`, … The
concatenated parts are one zstd stream (64 MiB window) of a POSIX ustar archive whose entries all live under `site/`.

- **Page-major order.** Directories come first, then files sorted by their path without the locale prefix, so the
  13 locale copies of a page follow each other and fall into the compressor's window. Nearly identical copies then
  cost almost nothing: the 4.6 GiB site packs into about 30 MiB (gzip in directory order needed 526 MB).
- **Parts.** Each part is at most 1 GiB (GitHub allows 2 GiB per asset and 1000 assets per Release); the server
  accepts at most 32 parts. Only the last part may be shorter than the others.
- **Manifest (schema 2).** Build identity (`key`, `revision`, `commit`, `data`), `builtAt`, all `locales`,
  `format: "tar+zstd"`, `size`/`sha256` of the whole stream, `parts` (`name`, `size`, `sha256`), `files`,
  `expandedBytes` and `pages`. Unknown fields are rejected.
- **Installation limits.** Only regular files and directories under `site/`; no links, devices, PAX or GNU
  headers; no `..`, absolute, Windows-reserved or case-colliding paths. The unpacked file count and bytes must equal
  the manifest's (at most 2 million files and 64 GiB), and every locale's home page and `_astro/` must exist.

Releases from before schema 2 (`site.tar.gz`) are not installable. Their key includes the commit, so a new image
never asks for them; to rebuild an old key, delete that Release and its tag.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `MOENOTES_GITHUB_TOKEN` | _(unset)_ | Fine-grained repository token: Actions read/write, Contents read. Required to build; never exposed by status |
| `MOENOTES_GITHUB_REPO` | `StarMoe-org/moenotes` | Public repository owning workflow and site Releases |
| `MOENOTES_GITHUB_REF` | `main` | Ref containing the workflow; the site checkout is independently pinned to `MOENOTES_REVISION` |
| `MOENOTES_REVISION` | image build argument | Full Git commit SHA; required |
| `MOENOTES_GITHUB_POLL_SECONDS` | `30` | Interval while waiting for Actions and the Release |
| `MOENOTES_ASSET_INTERNAL` | _(unset)_ | In-cluster origin of the asset service, used for the server's version checks |
| `MOENOTES_MASTERDATA_INTERNAL` | _(unset)_ | In-cluster origin of the metadata service, used for the server's version checks |
| `MOENOTES_API_INTERNAL` | _(unset)_ | Origin of starmoe-api, with its scheme: in-cluster, or public `https://` when it runs on another server. `/api/*` is forwarded there. It answers 404 while the variable is unset or invalid; an invalid value is logged at startup ([account.md](account.md)) |
| `MOENOTES_ROOM_CHECK_INTERNAL` | _(unset)_ | Absolute http(s) base URL of the Room Check service. `/api/room-check/*` is forwarded there, and the site's session is checked against `MOENOTES_API_INTERNAL` for the actions that belong to an account. The variable is unset or invalid: the route answers 404 and an invalid value is logged at startup ([room-check.md](room-check.md)) |
| `MOENOTES_ROOM_CHECK_KEY` | _(unset)_ | Optional shared key, sent to the Room Check service as `X-Room-Check-Key`; never logged or exposed |
| `MOENOTES_DATA_DIR` | `/data` | Volume for builds, logs and state |
| `MOENOTES_SOURCE_DIGEST_FILE` | `/app/source-digest` in the image | The image's source digest |
| `MOENOTES_APP_DIR` | _(unset)_ | Development: compute the source digest from this checkout instead |
| `PORT` / `HOST` | `80` / `0.0.0.0` | Listen address |
| `MOENOTES_POLL_SECONDS` | `60` | Release manifest poll interval |
| `MOENOTES_BUILD_TIMEOUT_SECONDS` | `3600` | Deadline of one attempt: waiting for CI, download and installation; errors keep the live site |
| `MOENOTES_KEEP_BUILDS` | `4` | Builds kept on disk (see [Disk](#disk)) |
| `MOENOTES_COMPRESS_WORKERS` | half the CPUs | Files the background compression works on at once |
| `PUBLIC_*` | public origins | Public build settings forwarded to CI and part of the source revision. `PUBLIC_ASSET_API` also moves the release manifest the server polls. See `src/config/assets.ts` and the feature docs for each variable |

`MOENOTES_BUILD_MODE`, `MOENOTES_SPLIT_LOCALES`, `MOENOTES_SYNC_WAIT_SECONDS`, `MOENOTES_SERVERS`,
`MOENOTES_VERSION_URL` and `MOENOTES_MASTERDATA_DIR` belonged to the former Bun server's local build mode. They no
longer have an effect; the server logs a notice when one is set. `MOENOTES_SERVERS` and `MOENOTES_MASTERDATA_DIR`
still apply to a local `astro build`.

### In-cluster origins

The deck solver Worker is served from `public/deck/` on the same origin. The solver engine and its deck data are files of the music data sites, found through `build.json` (or `music-data.json`) and the replay manifest it names; a new engine or data needs no rebuild or redeployment. See [deck-worker.md](deck-worker.md).

The card box serves its screenshot-recognition Worker and modules from `public/recognition/` on the same origin. The gallery and its reference embeddings, ONNX Runtime Web and the recognition models are content-addressed files on the recognition site (`PUBLIC_RECOGNITION_SITE`), found through its `recognition/current.json` pointer; a new bundle needs no rebuild or redeployment. See [card-box.md](card-box.md) for the bundle format, integrity checks and license locations.

`MOENOTES_ASSET_INTERNAL` and `MOENOTES_MASTERDATA_INTERNAL` replace the public origins for the requests the deploy
server makes itself: both version manifests. A local `astro build` with the same variables sends its MasterData and
story table requests there too (`src/lib/build/fetch.ts`). The internal origin must serve the same paths as the
public one. Pages keep linking to the public URLs; browsers never see the internal addresses. There is no fallback to
the public origin: a wrong internal address fails the version check (with the address in the log) and the live
build stays.

## Caching across builds

Astro renders every page on every build; what carries over between versions is the I/O around rendering.

- **Upstream responses.** The Actions build stores MasterData and story table responses with their ETag in the
  Actions cache and revalidates them on the next run, so tables that did not change answer 304. The build log ends
  with `[build-fetch] N unchanged (304), M downloaded`.
- **Output.** Before a build goes live the server compares each file with the live build (size and SHA-256 from
  `files.json`). Identical files are hard-linked to the live build's copy together with its compressed variants, so
  only changed files take new disk space. Linked files keep their mtime, and with it their ETag.
- **Compression.** A build goes live without waiting for compression. The server then adds brotli (quality 9) and
  gzip (level 9) variants to every compressible file that lacks them, in the background with
  `MOENOTES_COMPRESS_WORKERS` files at once. Until a file's variants exist it is sent uncompressed (a CDN in front
  can compress it on the way). A code change touches every page, so the whole site is compressed again; a data update
  only compresses the pages it changed. The next build waits for the compression before linking, and a compression
  cut off by a restart resumes at the next start.

## Serving

The server serves the Astro output like the former Caddy setup: `{path}`, `{path}/index.html`, `{path}.html`, else
`/404.html` with status 404. `/_astro/*` is content-hashed and sent with
`Cache-Control: public, max-age=31536000, immutable`; files missing from the live build are looked up in the
earlier builds kept on disk, so a page loaded just before a swap still finds its scripts. Everything else is
`no-cache` with an ETag. Compressible files are sent as their precompressed `.br` / `.gz` variant when the
client accepts it and the variant has been written (see [Caching across builds](#caching-across-builds)).
Uncompressed responses support byte ranges.

| Endpoint | Answer |
| --- | --- |
| `/healthz` | 200 while the process runs (liveness; use this for platform health checks) |
| `/readyz` | 200 once a build is live, 503 before |
| `/_moenotes/status` | JSON: live build, source revision, build in progress (`step`, `pages`), background compression (`compressing`: build id and start), wait reason, last failure, last check |
| `/api/*` | Forwarded to starmoe-api (`server/internal/web/proxy.go`), also before the first build; 404 without `MOENOTES_API_INTERNAL`, 502 when the API does not answer |
| `/api/room-check/*` | Forwarded to the Room Check service (`server/internal/web/roomcheck.go`), also before the first build; 404 without `MOENOTES_ROOM_CHECK_INTERNAL`, 502 when the service does not answer. Account-bound actions answer 401 `{"error":"login_required"}` without a session ([room-check.md](room-check.md)) |

Before the first build completes every site path answers 503 with `Retry-After: 60`.

## Disk

```text
/data/state.json               live build record
/data/github-build.json        the dispatched Actions run, while one is pending
/data/builds/<id>/site/        web root: the installed build + .br/.gz variants (added once live)
/data/builds/<id>/files.json   size + SHA-256 per file for the next link step
/data/builds/.staging-<id>/    build being installed (removed on failure and at startup)
/data/logs/<id>.log            installation and compression log of the last 10 attempts
/data/logs/latest.log          link to the newest attempt's log (running or finished)
```

A full build is about 4.6 GB of output plus its compressed variants; the download itself is about 30 MB.
`MOENOTES_KEEP_BUILDS` counts the live build, the previous build in full (hard links make it cost only the files
that changed) and older builds reduced to their `_astro/` directory. A build being installed needs room for its
whole output until it is linked against the live one.

## Operations

- **Reinstall a build** without new data or code: set `current.key` in `/data/state.json` to `""` and restart.
  The server reuses the verified `site-<key>` Release; it does not overwrite or rebuild that immutable artifact.
  To build changed code, deploy a new image commit. The live build keeps serving until the replacement is ready.
- **Logs**: the container prints the server's decisions; `/data/logs/<id>.log` has each attempt's steps, with the
  background compression appended, and `/data/logs/latest.log` always names the newest attempt.
- **Progress**: while a build runs the container prints a line every 30 s, e.g.
  `build 20261013T080000Z-ab12cd34-github: GitHub Actions 123456: in_progress, 4m10s elapsed`. `/_moenotes/status`
  reports the same under `building`. After the download the step reads `finalize` (linking against the live build),
  or `waiting for the live build's compression` while the previous build is still being compressed; the compression
  itself shows under `compressing`.

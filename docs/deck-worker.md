# Deck solver runtime

The deck solver recommends teams with an engine compiled to WebAssembly, run in a dedicated Worker. The engine
and the data it reads are published with the music data of each game server; this site serves only the Worker. A newly
published engine or data needs no rebuild or redeployment of this site.

| Part | Where | Code |
| --- | --- | --- |
| Runtime source | Music data site: `build.json`, `music-data.json`, the replay manifest | `src/lib/deck/runtime-source.ts` |
| Worker | This site: `/deck/deck-worker.js` and `/deck/deck-worker-core.mjs` (`public/deck/`) | `public/deck/` |
| Messages | `moenotes.deck-worker/1` | `src/lib/deck/worker-protocol.ts` |
| Worker lifecycle | The page | `src/lib/deck/worker-client.ts` |

## Runtime source

Deck data follows two lines: `jp` for the JP server, and `intl` for the tw, kr and en servers, which share one
MasterData build (servers.md). Each line has its own music data site:

| Line | Servers | Site | Default |
| --- | --- | --- | --- |
| `intl` | tw, kr, en | `assetConfig.musicDataSite` (`PUBLIC_MUSIC_DATA_SITE`) | `https://storage.bdon.moe/moenotes/music-data` |
| `jp` | jp | `assetConfig.musicDataSiteJp` (`PUBLIC_MUSIC_DATA_SITE_JP`) | `https://storage.bdon.moe/moenotes/jp/music-data` |

`resolveDeckRuntime(server)` reads, in order:

1. **`build.json`** of the site, requested with `cache: "no-cache"`. Its `replay` field names the replay manifest:
   `{"format": "nnnotes.replay-manifest/1", "manifestUrl": "…", "sha256": "…", "charts": …}`. The publisher writes
   `build.json` after every file the manifest names, so a manifest it names is complete.
2. **`music-data.json`**, only when `build.json` has no `replay` field or does not exist. Its `replay` field has the
   same shape. The file is read through the chart data tool's loader and shares its five-minute browser cache
   (browser-cache.md).
3. **The replay manifest** at `manifestUrl`, relative to the file that named it. Its size is not known in advance; its
   SHA-256 must equal the reference's `sha256`, and its `format` must be `nnnotes.replay-manifest/1`.

The manifest names files by `{url, sha256, bytes}`; each `url` is relative to the manifest. The deck solver uses two
entries:

```json
{
  "format": "nnnotes.replay-manifest/1",
  "deckData": { "format": "nnnotes.deck-data/1", "url": "deck-data.json", "sha256": "…", "bytes": 0 },
  "engine": { "model": { "commit": "…" }, "…": "the replay engine" },
  "recommendEngine": {
    "model": { "name": "…", "version": "…", "source": "…", "commit": "…", "format": "…" },
    "js": { "url": "…", "sha256": "…", "bytes": 0 },
    "wasm": { "url": "…", "sha256": "…", "bytes": 0 },
    "build": { "url": "…", "sha256": "…", "bytes": 0 }
  }
}
```

`recommendEngine.model.commit` must equal `engine.model.commit`; the Worker later checks that the deck data's
`provenance.deck.commit` names the same commit. The SHA-256 values change with every publication, so the page resolves
the runtime again for each session and never stores them.

The result is one of:

| Status | Meaning |
| --- | --- |
| `available` | Every URL absolute, with its SHA-256 and size: the manifest, `deckData`, and the engine's `js` (glue), `wasm` and `build` |
| `unavailable` | The published data offers no solver: `no-replay` (neither file names a manifest), `no-deck-data`, `no-recommend-engine` (the manifest has no `recommendEngine` key: this data version has no recommendation engine), `model-mismatch` (the two engines name different model commits) |
| `failed` | Reading the data failed: `network` (transport or HTTP status), `integrity` (the manifest's SHA-256 differs), `format` (a file or entry this version cannot read) |

An aborted signal rejects the call instead.

### Development engine

For a locally built engine, `resolveDeckRuntime` accepts `engineOverride`: an engine descriptor, or the URL of one.
Development builds (`astro dev`) also read the descriptor URL from `PUBLIC_DECK_RECOMMEND_ENGINE`; production builds
ignore that variable. A descriptor has the shape of `recommendEngine`; its URLs are relative to the descriptor, and a
file without `sha256` and `bytes` is downloaded once to compute them. The override replaces `recommendEngine` only:
the deck data still comes from the published manifest, and the model commit checks are skipped (`modelCommit: null`).
The served files need `Access-Control-Allow-Origin` for the page's origin.

## Worker

The Worker is a classic Worker served by this site, because a Worker script must be same-origin. `deck-worker.js`
imports `deck-worker-core.mjs` with dynamic `import()`; the core holds all the logic and is tested directly.

On `init` the core downloads the deck data, the engine WASM and its glue, and checks each one's size and SHA-256
against the message before using it. Then it:

1. parses the verified deck data once to read `provenance.deck.commit` and the available event, song and scene IDs,
   then checks the commit against `modelCommit` (unless `null`);
2. imports the glue, a wasm-bindgen `--target web` ES module, from a `blob:` URL of its verified bytes, and calls its
   default export with `{ module_or_path: wasmBytes }`, so the WASM is never fetched again unverified;
3. constructs `new DeckSolver(deckDataBytes)` with the deck data as a `Uint8Array`;
4. checks that `solver.datasetId`, the lowercase hex SHA-256 of the deck data bytes, equals `deckDataSha256`;
5. reads `solver.capabilities()` as JSON text, when the solver has it, and returns the dataset catalogue in `ready`.

The catalogue contains `eventIds`, `musics: [{id, difficulties, hasLuck}]`,
`challengeMusics: [{id, eventId, musicId}]` and `arenaMusics: [{id, musicId}]`. Master IDs come from the columnar
`MasterEvent`, `MasterLiveMusic`, `MasterChallengeMusic` and `MasterArenaMusic` tables. A song's available difficulties
are the `_easyID`, `_normalID`, `_hardID` and `_expertID` values also present in `charts[].scoreId`. A known song can
have an empty difficulty list. Absent or malformed tables and ambiguous IDs do not declare availability.

`hasLuck` is `true` when any `_gekisouMission1..3` value is LUCK (`2`), `false` when every mission is COMBO (`1`)
or JUST (`3`), and `null` when the mission data is otherwise incomplete. Gekisou team calculations require
`hasLuck: false`. Free Live, Challenge Live, Skip and power calculations use their own scene checks regardless of
this flag.

The page uses this view to check whether the loaded dataset can serve the selected goal while publications update.
The original deck bytes and their `datasetId` remain the solver input. A `ready` message with an omitted or `null`
catalogue is accepted as `catalog: null`.

`solver.recommend(accountJson, requestJson, onProgress, intervalMs)` is synchronous. Each `onProgress` call carries a
complete result of the same shape as the final one, and the Worker forwards each as a `progress` message. Input
problems come back inside the result; a throw is a crash. The solver input and output stay JSON text end to end, so
integers beyond 2^53 keep their exact digits.

Browser support: dynamic `import()` in a classic dedicated Worker, including from a `blob:` URL, works in Chrome and
Edge 80, Safari 15 and Firefox 114 and later. The site sends no Content Security Policy; one added later must allow
`blob:` scripts in Workers and `'wasm-unsafe-eval'`.

## Messages: `moenotes.deck-worker/1`

Every message has a `type`.

| Direction | `type` | Fields |
| --- | --- | --- |
| page → Worker | `init` | `protocol: "moenotes.deck-worker/1"`; `deckDataUrl`, `deckDataSha256`, `deckDataBytes`; `wasmUrl`, `wasmSha256`, `wasmBytes`; `glueUrl`, `glueSha256`, `glueBytes`; `modelCommit` (string or `null`) |
| Worker → page | `ready` | `datasetId`, `initMs`, `capabilitiesJson` (string or `null`), `catalog` (availability object or `null`) |
| page → Worker | `run` | `jobId`, `inputRevision`, `accountJson`, `requestJson`, `progressIntervalMs` |
| Worker → page | `progress` | `jobId`, `inputRevision`, `resultJson` |
| Worker → page | `result` | `jobId`, `inputRevision`, `resultJson` |
| Worker → page | `failed` | `code`, `message`; `jobId` and `inputRevision` when it concerns a run |

`deckWorkerInit(runtime)` builds the `init` message of a resolved runtime. A Worker serves one runtime: an `init` with
other files is refused, and a repeated identical `init` answers with the same `ready` or `failed`. A `run` sent before
`ready` waits for initialization.

| `code` | Meaning |
| --- | --- |
| `network` | A download failed |
| `integrity` | A file's size or SHA-256 differs from `init`, or the solver reports another `datasetId` |
| `identity` | The deck data names another model commit than `modelCommit` |
| `init` | The glue, the WASM or the `DeckSolver` constructor failed |
| `runtime` | The solver threw during a run; the Worker refuses later runs |
| `protocol` | A malformed or out-of-order message |

## Lifecycle

`DeckWorkerClient` keeps at most one Worker and one job:

- The Worker starts on the first `prepare(runtime)` or `run(job)` and receives `init` once. Later runs of the same
  runtime reuse it; a run of another runtime replaces it.
- A reply counts only if its `jobId` and `inputRevision` match the current job; any other is dropped, as is every
  message of a Worker already terminated.
- `run` resolves to `complete` with the final result, or to `failed` with the Worker's code. A failed Worker is
  terminated, and the next run starts a new one.
- A running recommendation cannot be interrupted inside the Worker. `stop()` terminates the Worker and resolves the job
  as `stopped` with its last `progress` result (or `null`), which the page shows as the answer. A new `run` while one
  is running does the same, resolving the old job as `superseded`. Stopping a job that still waits for `ready` keeps
  the Worker for the next run.

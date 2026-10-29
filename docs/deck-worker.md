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

### Engine descriptor override

By default (`assetConfig.deck.recommendEngine = "/haneoka-team-engine/runtime.json"`), both development and production
builds load the site's pinned [Haneoka team engine](haneoka-engine.md) descriptor. `resolveDeckRuntime` also accepts
`engineOverride` (`null` to use the replay manifest's `recommendEngine`, or another descriptor/URL), and development
builds (`astro dev`) read `PUBLIC_DECK_RECOMMEND_ENGINE`. A descriptor has the shape of `recommendEngine`; its URLs are
relative to the descriptor, and a file without `sha256` and `bytes` is downloaded once to compute them. The override
replaces `recommendEngine` only: the deck data still comes from the published manifest, and the model commit checks are
skipped (`modelCommit: null`). The served files need `Access-Control-Allow-Origin` for the page's origin.

## Worker

The Worker is a classic Worker served by this site, because a Worker script must be same-origin. `deck-worker.js`
imports `deck-worker-core.mjs` with dynamic `import()`; the core holds all the logic and is tested directly.

On `init` the core downloads the deck data, the engine WASM and its glue, and checks each one's size and SHA-256
against the message before using it. Then it:

1. parses the verified deck data once to read `provenance.deck.commit` and the available event, song and scene IDs,
   then checks the commit against `modelCommit` (unless `null`);
2. imports the glue, a wasm-bindgen `--target web` ES module, from a `blob:` URL of its verified bytes, and calls its
   default export with `{ module_or_path: wasmBytes }`, so the WASM is never fetched again unverified;
3. when `masterOverlayUrl` (`/api/v1/meta/deck-master?server=…&v=…`) is present on `init`, merges the live Next.js
   columnar `master` tables (`moenotes.deck-master-overlay/1`) onto the verified `deck-data.json` snapshot, recomputes
   the merged dataset SHA-256, and constructs `new DeckSolver(mergedBytes, { datasetId: mergedSha256 })` (falling back
   cleanly to the baseline `deckDataBytes` if the overlay endpoint is unreachable or rejected);
4. checks that `solver.datasetId`, the lowercase hex SHA-256 of the active deck data bytes, matches the expected hash;
5. reads `solver.capabilities()` as JSON text, when the solver has it, and returns the dataset catalogue in `ready`.

The catalogue contains `eventIds`, `musics: [{id, difficulties, hasLuck}]`,
`challengeMusics: [{id, eventId, musicId}]` and `arenaMusics: [{id, musicId}]`. Master IDs come from the columnar
`MasterEvent`, `MasterLiveMusic`, `MasterChallengeMusic` and `MasterArenaMusic` tables. A song's available difficulties
are the `_easyID`, `_normalID`, `_hardID` and `_expertID` values also present in `charts[].scoreId`. A known song can
have an empty difficulty list. Absent or malformed tables and ambiguous IDs do not declare availability.

`eventItemRewards: [{id, itemId, normal, challenge}]` reports event-badge reward availability. The event ID and
item ID come from `MasterEvent._id` and `_eventItemId`. The normal and challenge flags join
`_liveEventRewardGroup` and `_challengeLiveEventRewardGroup` to `_eventGroup` in `MasterLiveEventReward` and
`MasterChallengeLiveEventReward`, respectively. Every grade in the linked group must have exactly one row across
all resources and `_probability: 10000`. `_scoreRank` identifies the grade. The catalogue checks this shape;
the engine computes the exact result grade and the reward amount.

The page also requires the engine capability
`eventItemRewards: {selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000}`
and support for the selected scene, metric and aggregation. An absent or mismatched capability or unsupported
reward-group shape disables the badge calculation. The request metric is
`{kind: "eventItems", eventId, resourceType: 1, resourceId: itemId, consumption}` and its event context contains
`resultClock` and `rewardProjection: true`. Each possible live result contributes the badge amount for its one
exact grade; the engine aggregates these amounts for the chosen objective. Event-point and challenge-point
requests also use `rewardProjection: true`.

### Challenge-point secondary priorities

The challenge-point metric accepts an optional `secondaryPriority` of `eventPointsFirst` or `eventItemsFirst`,
with `resourceType: 1` and the event badge `resourceId`. These three fields are emitted together only for a
combined objective. The goal uses expected rewards: maximize CP first, then PT and badges in the selected order.
It supports ordinary Live scenes and ordinary Skip. Results contain up to `k` teams from the highest-CP tier;
that tier may contain fewer than `k` teams. A time-limited search remains unproven.

Both the event-item reward capability above and this capability are required:

```json
{"challengePointPriorities":{"priorities":["eventPointsFirst","eventItemsFirst"],"objective":"lexicographicExpected","primary":"challengePoints","bestPrimaryOnly":true,"lotteryFree":true}}
```

The engine reports unsupported skill conditions. Badge resource and reward-catalogue checks also apply to the
combined objective. Pure challenge-point requests retain their scene and metric capability checks.

The result metric echoes `secondaryPriority`, `resourceType` and `resourceId`. Each combined-result team includes
`eventRewards: {challengePoints, eventPoints, eventItems}`; each value has `score`, an exact rational
`{numerator, denominator}` using decimal strings, and `interval: null`. The CP primary value remains in
`team.value.payoff`. A combined result with missing or malformed reward values is a protocol error. The page
uses the result's echoed priority and rewards when displaying a previous calculation. Combined results show
the complete proof state; scalar CP-bound gaps are omitted from their display because secondary ranking
requires the full lexicographic proof.

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


### Haneoka reward extension identity

The development Haneoka runtime records the pinned upstream commit plus `model.patchSha256` and a downloadable
`model.patch` file entry. `patches/haneoka-rewards.patch` adds exact reward sums, primary CP ranking, ordinary
costs 6 through 9, ordinary / challenge Skip reward contexts, and exact combined reward vectors. Answers retain
`engine.patchSha256` for this model identity. The source dataset identity and production provider commit checks remain the original ones.

The adapter consumes the existing `jp` / `intl` account envelopes and the page's numeric Int64 clock tokens.
Reward projection isolates saved balances but preserves the reference event window. The adapter retains tick
precision during parsing; Skip progress includes deterministic Skip score and exact payoff just like final output.

The adapter advertises `combinedMetric` for the existing page's weighted expected-sum requests (three levels,
nine terms, weights 1 through 1,000,000,000). Native comparison is lexicographic with exact integer sums;
results and progress include `team.levels` with exact per-level and per-term payoffs. Top-K distinguishes
leaders and member-to-Snapshot assignments. A time limit retains the available formations without proof.
The page's automatic CP conversion uses its existing challenge-rate request, exact payoff/cost extraction,
and subsequent combined request. Played combined rewards remain expected-only. Ordinary and Challenge Skip
combined rewards also accept maximum, as do single ordinary Skip PT/items/CP and Challenge Skip PT/items.
One deterministic settlement gives the same payoff as expected, with denominator 1. The answer parser allows
combined maximum only for Skip. Challenge routes cannot earn CP. The existing page normalizes Skip to expected.
Played maximum rewards and other event scenes remain outside this adapter's advertised capability.
Single PT/item requests compare payoff then power in one complete-pool search; they do not implicitly rank
the other reward or played score. Conservative coupled bounds are cached within each assignment, and ordered
matching supplies remaining power and bonus upper bounds. Single Skip CP is constant by result grade and ranks equal-payoff teams by power.

The adapter also accepts ordinary / challenge Skip `score` requests and power with one selected event's
parameter bonuses. Skip score has one deterministic result and no skill-order statistics; expected and maximum
aggregation select the same value. Parameter bonuses do not change normal song typing. Native search compares
Skip score directly, and progress retains the same score field as final output.

### Haneoka preparation and early candidates

The development adapter uses one absolute request deadline, including validation and proposal generation.
Free combined rewards may use a native score search with a 100 ms budget to propose seeds; every seed is evaluated
by the original full reward objective. Exact multi-level upper vectors prune only against `k` retained legal
formations. A separate first-level stage may fix a prefix only after proving K physical formations share its
exact optimum. Otherwise it supplies seeds to the original objective. The remaining-level search retains the
complete pool and checks the fixed certificate on every accepted exact candidate.

For LUCK Gekisou, one legal proposal is scored through native fixed-team replay before full preparation. Other
Gekisou requests enter native search directly. The replay uses the requested accuracy and expected/maximum
aggregation and leaves the full-search cache intact. Early candidates do not carry proof into the full request.
Frame replay and order completion also check the absolute deadline, including periodic MISS replay. Interruption
retains completed candidates with incomplete proof and unknown counters/bound. The same context can search again.
LUCK distribution frames and bootstrap replay also observe the deadline. Fallible context construction returns
deadline errors without turning them into runtime panics, and interrupted work is not cached as complete.
The adapter reserves up to 40 ms for LUCK job boundaries and finalization. Preparation and finalization remain
cooperative, so the budget is not a hard wall-clock cutoff. See [the full-pool report](haneoka-performance.md) for measured overhead.

Skip reward grades also accept the source model's numeric and comma-separated named enum forms. A missing
settlement row for the parsed grade is an invalid request, rather than a zero-reward result.

### Played maximum rewards

The Haneoka development adapter advertises single PT and event-item maximum for Free and Challenge Live.
The existing page producer and Worker protocol carry these requests unchanged. The native engine compares
the largest settlement across 120 orders, then power, and returns the first canonical order achieving it.
Progress and final output use one selected score/payoff with exact denominator 1, `orders: null`, and a
`bestOrder` containing score, payoff and member order. Expected rewards keep their 120-order mean statistics.
Played combined maximum remains outside the advertised capability; Free CP maximum is supported as described below. Skip keeps its
deterministic one-settlement path. The production provider remains unchanged.


### Battle and Mission event rewards

The Haneoka development adapter accepts single expected/maximum PT, event items and CP, plus expected combined rewards, for Battle/Mission/Arena.
Battle/Arena carry the page's explicit `room` policy; Mission uses the solo result rule. Existing page-produced
requests, account coverage, budgets and Worker lifecycle are retained. Non-LUCK payoff certificates cover
all 120 skill orders. LUCK returns a four-root mean with an all-grade support interval, `exact: null`, no
order statistics, incomplete proof and `exitReason: "sampled"`; maximum additionally names the order with the largest mean over roots; the roots are recorded in `rewardSampling`.
This is the donor's finite-root route, not the published model's complete probability-law solver.

The optional `combinedMetric.goals` capability lists scenes that support combined objectives. Omission
preserves legacy providers' behavior; a malformed list disables only the combined capability. The page
checks the main scene and an automatic challenge-rating scene against this scope. The Haneoka scope now includes all six supported live/Skip scenes. Played combined maximum remains unsupported. The production provider is unchanged.


### Free Live maximum CP

The Haneoka adapter now advertises `challengePoints` under `aggregations.maximum.freeLive`.
The existing page request selects maximum CP over all 120 skill orders, then power. `bestOrder` contains
the first canonical order earning that maximum CP. Its played score and CP payoff both have exact
denominator 1; order summary statistics are null. Expected CP retains mean payoff and 120-order statistics.
The final hash-bound bundled Worker is checked at the page's default five-team count. Expiry preserves
the candidates and incomplete proof state. No Worker protocol fields or production provider are changed.


### Cross-song scope and candidate continuation

The optional capabilities `crossSong: true` and `resume: true` independently enable the corresponding page
controls. Providers omitting them keep the existing single-song lifecycle. Protocol version remains
`moenotes.deck-worker/1`; `run.seedJson?: string` is optional and is forwarded as the fifth argument to
`recommend(accountJson, requestJson, progress, progressIntervalMs, seedJson)`. Existing JavaScript and
wasm-bindgen providers ignore the extra argument.

Haneoka cross-song goals carry one validated ID list (`musicIds`, `challengeMusicIds` or `arenaMusicIds`).
The producer adds the scope without parsing and rounding existing Int64 clock tokens. Responses preserve
`teams[].song: {musicId, difficulty}` and `result.coverage: {covered, total, proven}` through the answer parser.
All supplied charts remain eligible even when time expires before complete coverage.

Raw progress/final output includes `continuation.teams`, containing up to K retained formations per song
and their song bindings. Superseded progress candidates do not enlarge later tokens. The page
stores this raw text alongside the frozen account/request and CP rating, and supplies it when continuing
the same inputs. Haneoka re-scores candidates; old values and proof flags cannot certify a new request.
The Worker remains synchronous inside its dedicated thread; Stop terminates it and keeps the last page
progress. A new Worker verifies the same data/runtime hashes before continuing. Rebuilding local runtime
files during a visit requires reloading the preview descriptor; a stale descriptor correctly fails integrity.
The production runtime provider and publication process remain unchanged.

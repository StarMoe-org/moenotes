# Haneoka engine integration

The Haneoka engine is pinned at `6de572be31b0fd8e4ab50825bd92c81ac625bc78` (`HANEOKA_COMMIT`) with
`patches/haneoka-rewards.patch` (`HANEOKA_PATCH_SHA`); see [Upstream tracking](#upstream-tracking).
The existing Moenotes card pool, account envelopes, Worker lifecycle and result components are reused.
The Rust engine, with the Moenotes reward patch, owns scoring and search; the adapter translates documents, goals and results.

## Local and production runtime

Install Bun, Git and Rust with the `wasm32-unknown-unknown` target, then run:

```sh
bun install --frozen-lockfile
rustup target add wasm32-unknown-unknown
bun run build:haneoka-engine
bun run dev
```

`assetConfig.deck.recommendEngine` defaults to `/haneoka-team-engine/runtime.json` in both development and production builds.
In development builds, `PUBLIC_DECK_RECOMMEND_ENGINE` can point at another descriptor URL or be set to `""` to use the
published replay manifest's `recommendEngine` instead.

The build keeps the pinned external checkout unchanged under ignored `.haneoka/engine`.
`patches/haneoka-rewards.patch` is applied to an independent generated source directory, whose file hashes
are checked before reuse. Cargo output also lives under `.haneoka/`. A changed generated source fails the build.
The patch uses LF on every checkout. The adapter's `HANEOKA_PATCH_SHA` must match the patch bytes. The runtime descriptor and answers record both
the upstream commit and patch SHA-256; the complete patch is copied beside the runtime as `moenotes.patch`.
Generated WASM, bundled adapter, runtime descriptor, license and NOTICE live under ignored
`public/haneoka-team-engine/` by default, or `--out <dir>` during site release builds (`scripts/build-site-release.ts`
writes directly to `.site-release/site/haneoka-team-engine` after `astro build` so `public/` and `sourceDigest` stay
unchanged). Passing `--test` runs `cargo test --locked` against the patched crate before compiling the WASM module.
These outputs must be built together; the descriptor binds their sizes and hashes.

## Data and model identities

The source dataset remains the published `nnnotes.deck-data/1`, verified by the existing replay
manifest's SHA-256 and size. Its `provenance.deck.commit` still identifies the original exporter/model;
it must not be rewritten to the Haneoka commit. The generated runtime descriptor identifies the Haneoka
scoring code separately. The Worker supplies the verified dataset hash to the adapter constructor;
the adapter binds its engine context and account requests to that exact dataset.

`src/lib/deck/haneoka/data.ts` maps columnar Master tables and every chart note, skill event and fever
interval into the Haneoka engine document. It preserves the source note order and uses the snapshot's
music duration. No chart approximation or independent scoring formula is introduced.

## Current capability boundary

- Power with optional parameter bonuses from one selected known event, with or without a normal song context.
  Parameter bonuses do not select challenge-song typing. Free Live, Challenge Live, Battle Live, Mission Live
  and Arena score searches; ordinary and Challenge Skip deterministic score searches (expected and maximum are identical).
- Skip score uses the native deterministic formula as its objective and bound. Nonnegative finite score factors
  are required for the power bound to remain monotone; an unsupported factor produces a diagnostic request error.
  It reads growth/player bonuses without requiring unused live skills, and returns no random-order statistics.
  Challenge Skip score uses challenge-song typing; parameter bonuses apply only when that challenge event is
  selected in `eventIds`, matching the source model. Ordinary Skip score ignores event parameter context.
- Free Live and Challenge Live single PT / event-item expected and maximum rewards; Free Live CP expected and maximum; ordinary Skip PT / CP /
  event items; Challenge Skip PT / event items. Ordinary consumption is 0 through 10; Challenge consumption is
  200/400/800/1600. Every positive cost must have exactly one matching source row.
- Battle Live, Mission Live and Arena single PT / event-item / CP expected and maximum rewards use native Gekiso replay.
  Battle and Arena require explicit `room.players` (1 through 5) and `othersAverageScore` (null for the local score,
  or a nonnegative Int32 peer average). Checked Int32 room totals use the source multiplayer thresholds;
  Mission uses ordinary solo result thresholds and rejects room/rank inputs. All three use ordinary boost costs.
  Non-LUCK rewards settle all 120 skill orders before averaging and use payoff/power ordering.
  LUCK charts settle four fixed roots (0 through 3), each over 120 skill orders. Their payoff point is a
  finite-root mean, with no exact whole-law payoff certificate. The payoff interval spans the minimum and
  maximum settlement over all eligible result grades at that team's bonus; it is a conservative support
  range, not a confidence interval. LUCK outputs keep proof false and omit order statistics. Expected outputs
  omit bestOrder; maximum identifies the order with the highest mean over roots. They
  expose `rewardSampling` plus `exitReason: "sampled"`. Sampling follows the song, independently of venue.
  Completed candidates survive expiry; interrupted counters stay unknown. A request-local 256-entry exact
  cache avoids repeated completed replays. The existing fixed-context scorer handles eligible LUCK plays;
  MISS/damage plays use full native replay. Every root has independent gameplay state.
  A native power preparation of up to 50 ms proposes legal teams without emitting unscored reward progress.
  Only a completed internal top-K power proof whose non-LUCK CP witnesses all reach the global CP ceiling
  may finish CP proof directly. Otherwise the same complete pool is searched with those candidates as seeds.
- Combined expected rewards use up to three lexicographic levels, nine total PT / event-item / CP terms,
  and positive integer weights through 1,000,000,000. The Haneoka capability scopes combinations to Free,
  Challenge, Battle, Mission, Arena and Skip through `combinedMetric.goals`.
  All terms refer to the same event. The existing page's
  manual conversion and automatic two-stage CP worth requests use this capability. Challenge routes cannot earn CP.
- Each combined level keeps an `i128` weighted sum of integer settlements. Only one level is projected to a
  monotone floating search key; exact vectors decide projected ties and final ordering. Lexicographic levels are
  never flattened into a large scalar. Bounds cover all reachable grades, with outward rounding. If signed Int32
  multiplication can wrap, PT/items use the universal settlement bound instead of assuming bonus monotonicity.
  Exact upper vectors cover every priority level; a branch is discarded only after `k` legal physical formations
  exist and its vector cannot beat the retained frontier. Character suffixes and remaining Snapshot matching
  tighten both PT and item bonuses while preserving the complete candidate pool. Per-order profile and coupled
  power/skill bounds also constrain reachable grade vectors.
  Free combined searches with multiple levels may first prove the first-level top K within a 1000 ms stage.
  Only a completed proof whose retained K formations share the same exact primary sum can fix that prefix.
  The full remaining-level search then visits the original pool and rejects candidates outside that certificate.
  An incomplete prefix stage supplies seeds only; its candidates never become an assumed global bound.
  Battle/Mission/Arena combined searches use conservative unbounded search bounds and retain all Snapshot
  options; a full-pool request can remain incomplete within its budget.
- Combined top-K retains physical formations: leader, members and member-to-Snapshot assignments. It preserves
  Snapshot options and disables roster-level lower bounds that would otherwise discard distinct formations.
  Progress and final answers expose each level and term's exact sum/count. Played rewards average 120 skill orders;
  Skip has one deterministic settlement. A deadline preserves candidates and leaves the proof incomplete.
- Automatic CP conversion first computes the selected challenge reward, then passes its exact payoff/cost through
  the existing page request producer. Its worth remains the best found value if that first search is incomplete;
  downstream proof certifies the emitted weighted objective, not optimality of an unfinished challenge search.
- Expected reward results retain mean played score or deterministic Skip score in `value.score`, and selected expected
  reward in `value.payoff.score`. `value.payoff.exact` contains the integer reward sum and observation count.
  CP ranking compares CP directly. The score tie used by the upstream CP objective is disabled for these requests.
  Single PT/item rewards resolve payoff ties by power, matching the published model; the donor's implicit other-reward
  and score refinement is not applied. One search compares reward first and power second over the original card pool. Remaining Snapshot matching
  supplies power upper bounds; a score-product relaxation is never substituted for a power bound. Integer
  settlement steps tighten reward upper bounds, and coupled score bounds reuse a fixed positive AM-GM scale
  and assignment prefixes. Ordered matching keeps the best available columns without reducing the legal pool.
  Single rewards retain distinct member rosters; combined rewards retain physical formations.
- Played non-LUCK single PT/items maximum searches compare the largest settlement over all 120 skill orders, then power.
  Equal-payoff orders use the first canonical formation permutation: nonleaders sorted by card ID, leader in slot 2.
  `value.score` is that order's native score, with exact denominator 1; `value.payoff` also has denominator 1.
  `orders` is null, and `bestOrder` contains its score, payoff and member order in both progress and final output.
  Bounds use maximum order scores and whole-settlement steps; mean-only relaxations are excluded.
  Signed Int32 overflow, negative bonuses or decreasing grade rewards disable monotone bonus/grade bounds and
  numeric dominance while retaining all Snapshot options. The exact settlement still follows the source arithmetic.
- Free Live maximum CP uses the native CP objective over all 120 skill orders, followed by power and the
  canonical team key. The first canonical skill order among equal maximum payoffs supplies `bestOrder`.
  Score and payoff refer to that same order, both exact denominators are 1, and `orders` is null.
  The maximum score bound is used only when grade-to-CP settlements are nondecreasing. Declining grade
  rewards retain all Snapshot options, disable unsafe score dominance and use a conservative payoff ceiling.
  The existing page's CP/Free/maximum controls, request producer and Worker protocol need no new fields.
  Expected CP keeps its existing mean objective and output.
- Ordinary Skip PT/items/CP, Challenge Skip PT/items, and combined ordinary / Challenge Skip rewards accept
  `maximum`. One deterministic settlement is identical under expected and maximum aggregation, with exact
  denominator 1 and no skill-order statistics. Challenge routes spend CP and cannot include CP earnings terms.
  Skip CP uses power to choose among its equal-payoff teams. Played combined maximum remains unsupported.
  The answer parser accepts combined maximum only for Skip. The existing page still normalizes Skip aggregation
  to expected; this adds the request/Worker capability.
- Rewards use the page's `rewardProjection: true` and played/Skip clock. Projection excludes saved balances;
  the original model's half-open event window still applies. Int64 tick tokens are preserved before comparison,
  including the final 100 ns before an event ends. Dates follow the model's canonical no-offset JST interpretation.
- The account envelope uses the page's `jp` / `intl` identifiers. Skip reads growth and player bonuses without
  requiring unused live/Gekisou skill levels. Skip result grades follow the source enum parser: case-sensitive
  names, signed Int32 decimal strings and comma-separated named values combined with bitwise OR. Whitespace
  follows Unicode White_Space. Invalid or overflowing tokens resolve to enum zero, as in the source model;
  a selected grade missing from a requested PT/item/CP table is diagnosed before search.
- Expected or maximum skill-order score; declared Great/Just distributions and periodic misses.
- Required/excluded members, excluded Snaps, fixed leader and no-Snap requests.
- Progress, time limits and intermediate candidates use the existing Worker lifecycle. Only a
  completed Haneoka proof becomes a proven result. Formation slot 2 holds the leader.
- The time budget starts before request/account adaptation. Combined played rewards skip the unrestricted
  score-cap preparation pass. Free combined requests generate native score seeds with a 100 ms search budget, including
  legal leader rotations with Snapshot bindings preserved; the original full search evaluates every seed.
- LUCK Gekisou requests first replay one legal power proposal through native `evaluateAll`, with the requested
  accuracy and aggregation. Its scored candidate survives later preparation expiry and remains unproven until
  the complete request finishes. Other Gekisou requests use their native seeds directly.
  Frame replay, maximum-order completion and MISS replay check the absolute search deadline. An interrupted
  replay returns the last completed candidates, incomplete proof and unknown bound/counters; it never reports
  an unfinished replay as zero evaluations. The chart context remains reusable for a subsequent search.
  The MISS replay objective now forwards Snapshot power preparation to its deterministic bound.
  WASM LUCK distribution frames and fixed-team bootstrap evaluation observe the same scoped deadline.
  Deadline errors propagate through fallible context construction; interrupted work is not cached as complete.
  Infallible bound contexts finish at their job boundary. LUCK requests reserve up to 40 ms of their budget for
  these boundaries and finalization. Preparation also checks between member/Snapshot jobs and support contexts.
  The budget remains cooperative: an indivisible job or finalization may extend wall time past the configured
  value. A zero budget returns no fabricated team.
- Unknown or conflicting account inputs remain missing/invalid. Relevant fields are checked before
  the engine's min/max growth policy can fill them.
- The verified JP and international snapshots have empty memory tables. Nonempty active memory
  tables use explicit saved member/support unlock flags and music-group ranks. Only unlocked owned cards
  count, including owned cards excluded from a formation. Per-stat member/support level bonuses and targeted
  music bonuses are added before band/music power multipliers. Source row order chooses the last reached
  level/reward. Missing or partial state remains missing; invalid IDs, flags, duplicates and group membership
  remain invalid. Declared active-table tests match the published provider; no live active-table claim is made.

## Arena, cross-song search and continuation

Gekiso Arena supports both `1.1.0.100+` league regulations (`goal.arena: { bandId, musicType, missions, mode }`) and
legacy `MasterArenaMusic` virtual-song rows (`goal.arenaMusicId`):
- Under `1.1.0.100+` regulations (`MasterArenaSeason`, `MasterArenaLeague`, `MasterArenaLeagueRegulation`), the page
  resolves active league rules from server MasterData or accepts custom band/attribute/mission rules. The engine scopes
  candidate members and released songs to `bandId` (using `_bandId` and multi-band `_bandIds`), overrides `musicType`
  (`0` chart default, `1..5` forced attribute, `99` attribute-free) and nonzero `missions` (`0` chart default,
  `1` COMBO, `2` LUCK, `3` JUST), and supports both `shared` (one formation maximizing the mean expected score across
  1 to 5 selected songs, returning per-song `aggregate` stats) and `individual` (best formation per song or across all
  band songs) modes.
- Legacy `MasterArenaMusic` IDs continue to map to internal virtual songs when `goal.arena` is omitted.

`crossSong: true` enables the page's all-songs checkbox. The scope includes every catalogue song at the selected
difficulty, every challenge song of the selected event, or every available Arena song (band-filtered `musicIds` under
`1.1.0.100+` individual Arena rules, or `arenaMusicIds` for legacy rows). Requests carry exactly
one of `musicIds`, `challengeMusicIds` or `arenaMusicIds`; incompatible, duplicate, empty and unknown scopes
are diagnosed. All charts remain in the request. Native scheduling divides remaining time across remaining
songs; result teams carry song identity and the status reports covered/total songs and proven count.
Mixed 120/480-observation combined results compare exact rational level values before power ties.

`resume: true` enables continuing an incomplete result with unchanged inputs. The Worker accepts optional
`seedJson`; the adapter takes only validated candidate formations and song bindings from `continuation.teams`.
The token retains at most K best candidates per song, dropping superseded progress candidates.
Native search re-evaluates candidates, ignoring old scores and proof flags. Previous winning songs run first;
other songs remain in scope. This is candidate-based continuation, not a serialized branch-and-bound stack.
The page keeps candidates visible, restarts the run timer and preserves the resolved goal and CP conversion
when continuing. Changing inputs makes the old result stale; server changes and retries discard continuation.
Stopping before new progress keeps the prior candidates. Continuation lasts for the current page visit.

The current page's scene families (including cumulative support-skill climbing score-ups and Gekiso Range placement
`rank` `1..5`) are covered and active in production via `/haneoka-team-engine/runtime.json`.
Played combined maximum and older provider-only threshold/capped/score-and-LIFE objectives are not advertised.
LUCK retains the native finite-root model and cooperative deadlines. Live-account and physical-phone
acceptance remain separate from declared-fixture and responsive browser verification.

## Upstream tracking

`node scripts/check-haneoka-upstream.mjs [--ref <commit>] [--patch]` reports the pinned commit against
`haneoka-gakuen/ournotes-team-builder` `main`, lists the commits since the pin, and `--patch` checks whether
`patches/haneoka-rewards.patch` still applies there. It needs git and network access, not Rust. It is a diagnosis, not
an upgrade: a clean patch only means the reward layer can be reviewed against the upstream changes, and the pin moves
only after `bun run build:haneoka-engine --test` rebuilds and tests the WASM with a Rust toolchain.

State at the current sync: pinned to upstream `main` at `6de572be31b0fd8e4ab50825bd92c81ac625bc78` (0 commits behind),
with `patches/haneoka-rewards.patch` (`d0ed4936a4737c7377fe6a036f2eca8c8ea880244dfdbeb1420b7e7a0561e167`) cleanly ported
and verified via `bun run build:haneoka-engine --test` and host + `wasm32-unknown-unknown` Clippy (`.github/workflows/haneoka-engine.yml`).
All upstream features through `6de572be` — optimal note/live/support timing guides with `planBaseScore`, `frameOriginMs`,
`planIsOptimal`, and earliest note input times; Gekisou timing guides (`timeline.guide`); bounded steady and partial
skill-covered JUST tap windows (`minJustWindowMs` and `justWindow`); Gekiso Arena section-priority search
(`arena.objective = "sections"` with `maxBaseLoss` and reference baseline); cooperative WASM clock yield imports
(`haneoka_cooperative_clock`); counting-snapshot activation anchoring; prepared card reuse; sampled LUCK inputs; and
exact integer event point parking — are active alongside Moenotes' remaining local patch surface (`LexRewards`,
`MoenotesRewards` with `just_window::Policy`, `SkipScore`, `FixedChallengePoints`, synchronous `wasm32` `SearchDeadlineScope`,
and legacy non-native `score_timed_order` chart compatibility).

Nothing in the deck page reads a live upstream commit: `runtime.json`, the answers' `engine.commit` and the licence
links all name `HANEOKA_COMMIT`, so any future upstream drift is visible and reproducible rather than silently mixed.

## Performance evidence

[Full-card-pool validation](haneoka-performance.md) records both servers, declared growth, exact model identities,
candidate/proof states, Worker-core coverage, and remaining latency and memory limits. Full-pool execution is
separate from complete browser/phone acceptance.

## Attribution

The engine's AGPL-3.0-only LICENSE and NOTICE are copied with the runtime and downstream patch. Changed Rust files carry a dated Moenotes modification notice. Haneoka result rendering
includes the NOTICE's translated attribution and an explicit link to https://haneoka.org. The site's license page also links to the pinned engine LICENSE and NOTICE.

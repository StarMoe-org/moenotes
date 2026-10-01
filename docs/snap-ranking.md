# Optional Snap skills in chart rankings

The ranking page accepts five optional, physically paired Snap skill slots. All five default to None. Clearing the profile restores the existing ranking and requires no WASM download. A selection records its ordinary/Gekisou kind, actual skill ID, level and real Snap card identity, rather than assuming a card's maximum growth.

The picker reuses `Modal`, `FilterButton`, `SupportCardArtwork` and `MemberCardArtwork`. Names, descriptions and IDs are searchable with NFKC normalization and AND tokens; source card names, characters and bands are included. Levels stay explicit. Skills that require a paired member expose its reference card and Gekisou level. A missing condition returns `needs-context`, with no guessed score.

## Calculation and architecture

The source client transports files. `snap-bridge` verifies replay manifest/resource SHA-256, sizes, region, master version and model commit before calling the existing Rust WASM `ReplaySession`. `snap-catalogue`, `snap-query`, `snap-profile` and source view models handle input and display identities. The Worker owns sessions, bounded point-result caching, job revisions and cancellation. React renders controls and measured results. There is no JavaScript scoring formula or WebGPU path.

Selected skills use a declared standard profile: five ordinary 5-second score-up skills at the percentages already entered, chosen measurement power, Great/Just input preset, seed 1, 60 fps, physical skill order 1–5, and Free Live or solo Gekisou with three fixed ranks. Reference members provide real attributes for conditions; their growth power and original live skill are not substituted for this standard profile. This is a reproducible measurement, not a random-order expectation, player's owned deck, or multiplayer simulation.

Each chart is replayed both with the selections and with all five Snap slots removed, retaining the other inputs. The original efficiency columns use score normalized by declared power and duration; raw simulated score, baseline and signed Snap difference remain in row hints and details. Pending or invalid rows remain empty. The chart detail reuses the same point; switching difficulty adds its chart to the replay job. It shows raw solo thresholds and chart event markers, without guessing Snap duration changes or deriving required power, success probability or dominance from legacy linear weights. Those objectives need the separate search in [the model/search design](deck-integration.md). The legacy range metrics, Gekisou aptitude and independent replay editor use other profiles and are hidden while Snap is active.

Changing a profile or source immediately hides previous results. Worker revisions reject late jobs; it yields after each paired chart result and disposes sessions on cancellation. Cache keys include the complete source identity, profile and chart ID, with a 1,500-point LRU limit. Changes to displayed duration or overhead reuse scores and only reorder the table.

## Source updates

`nnnotes` [#7](https://github.com/StarMoe-org/nnnotes/pull/7) adds region-separated source refresh, consumer identity and raw score-rank validation. [#8](https://github.com/StarMoe-org/nnnotes/pull/8) exports a SHA-bound `nnnotes.replay-labels/1` sidecar at `replay.snapLabels`, containing the same snapshot's skill descriptions and card artwork metadata. Payload resources precede their manifest during publishing.

The UI never borrows the site's merged build-time master tables. Without the optional label sidecar it uses names from the same music-data catalogue, omits unexpanded descriptions and artwork with unknown asset IDs, and keeps ID search available. Card artwork uses the verified music snapshot's server scope. `MasterSkillTarget` names resolve through their actual character/band predicates; condition targets are separate from effect targets.

Judged-input replays cannot reproduce raw touch timing effects. Those choices are visible and disabled with an explanation. This feature's current source/model snapshot is not certification of the latest JP 1.0.4 runtime or online IFix rules. The native whole-live and search gates remain separate prerequisites for formal deck recommendation.

## Verification

Pure tests cover default None, URL restoration, slot pairing, search/filter/level behavior, source mismatch, unresolved descriptions, source/profile changes, stale Worker responses, cancellation, bounded cache and the unchanged legacy ranking. The browser check runs on CNB with the actual shipped WASM and SHA-bound same-snapshot fixtures, not mock scores. Full source resources stay outside Git. Five core locales, architecture, routes, UI text and search/SEO checks are required.

[Browser proof](snap-ranking-browser-proof.json) records 85-chart real UI runs, five slots, URL restoration, mobile overflow, and the production-built Worker matching two independently captured same-input WASM cases. The proof distinguishes the UI seed/member Gekisou settings from those two reference cases. It does not claim native-game certification from a WASM-to-WASM comparison.

The `ournotes-player@0.1.6` Bun patch exposes the published player input-plan helper and adds the reviewed UI projection/Sprite restoration changes. The input-plan implementation is unchanged. Use Bun 1.4.2 to reproduce the patched installation and tests.

The feature and data-update PRs integrate into `dev`. Production data publishing and native whole-live certification remain separate steps.

## Native selection and legality

The formation uses the original five-slot game prefab and the companion nnnotes assembler; member and Snap pickers reuse the site's modal/filter controls. Member selection stages the reference card and actual Gekisou level together before applying. Search includes card titles, characters, bands and IDs. Original scene controls and efficiency/event columns remain in place; measured scores, baselines and Snap differences are available in row hints and details. The declared-power ratio does not authorize linear power inversion, probability estimates or dominance filtering.

Snap URLs can carry an actual card identity as `kind:skillId:level:cardId`. Existing three-field URLs remain parseable, but a skill shared by several cards requires an explicit card choice. A unique binding can be resolved without changing the effect. Modal groups show each real card and only its reachable skill levels from the same snapshot's rank bindings.

The centralized legality check rejects duplicate member characters, duplicate actual Snap card IDs across skill kinds/levels, unknown IDs, unreachable card/skill levels and effects outside the supported measurement plan. Distinct cards with the same skill remain legal. These identity rules come from TW native `KeepCardIdConsistency`; the web rejects the proposed selection instead of moving the previous slot. Source/client scope remains separate from latest JP certification.

None stays available for optional reference attributes and disabled contributions. A character/band mismatch can change whether a conditional effect activates; it is not automatically an illegal pairing. URL validation uses the same rules, clears displayed rows synchronously and prevents Worker evaluation. Picker disabled states are accompanied by explanations and handlers revalidate before applying.

See [native formation UI](game-ui.md) for source validation, original Sprite geometry, transparent portrait overflow, camera projection and regional artifact configuration.

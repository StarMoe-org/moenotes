# Release asset layout

The release bucket is configured by `assetConfig.releaseSource`. Existing logical
PNG paths resolve through the generated image index; member-card `_atlas` paths
select the original named image, not a face/formation crop. Export sequence
numbers vary between assets and must not be hardcoded.

Story tables use `Adv/Episode/<script>/<script>-<table>/<script>-<table>.json`.
Only tables present in the manifest are redirected. The existing parser accepts
their `_header` / `_allData` representation.

Story audio resolves by the exact cue-sheet key and cue label to an M4A object.
The release resolver does not subtract one from a cue number. That adjustment
remains confined to the legacy WAV resolver. An audio package with multiple
cues is not treated as a single sound unless its matching cue is known.

## Refreshing the index

Download `_meta/manifest.json` from the configured release bucket to a local
file, then run:

```sh
node scripts/sync-release-assets.mjs <manifest.json>
bun test tests/release-assets.test.ts tests/story-assets.test.ts
bun run lint
bun run check:search-seo
ASTRO_TELEMETRY_DISABLED=1 bun run check
```

The generator saves only relative paths, source labels, and available table
names. It selects exact image labels in deterministic object-key order, excludes
thumbnail outputs, and skips audio labels with conflicting content hashes.
Review and commit the generated JSON along with any resolver changes.

The verified 2026-09-24 manifest supplies 1,583 image keys, 946 story groups, and
738 audio sheets. Formal-host checks covered release character icons, card
artwork, JSON tables and M4A responses; one main-story chapter parsed into 115
lines with 110 release audio links.

The image scope also covers gacha banners and logos, home and limited-mission
banners, season pass banners, login bonus sheets, title (`Image/Degree`) art,
profile backgrounds with their thumbnails, and home spot thumbnails. With these,
the same manifest yields 1,842 image keys; the earlier keys are unchanged.

The release bucket is the only asset source; the old test-server bucket and its
backup are no longer referenced. A path the index does not list resolves to no
URL, and the UI shows its unavailable state instead of guessing an object name.

Known gaps in the 2026-09-24 export: song audio (cue sheets such as
`A_Abracadabra` and `A_Abracadabra_short`) and ADV `Adv/Stage` / `Adv/Still`
art. The asset catalog lists the song bundles (e.g.
`cri_assets_cri_sound_a_abracadabra.bundle`), but they have not been downloaded
or decoded yet. Songs resolve like every other CRI sound, by cue sheet and cue
name under `Cri/Sound/<cue sheet>/`, so they appear once a refreshed manifest
includes them and the index is regenerated.

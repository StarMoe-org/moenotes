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

Unmapped paths continue to use the legacy bucket. In particular, this manifest
does not provide the old assembled `Cri/Sound/MusicScore` tracks or a confirmed
replacement for `Adv/Stage` / `Adv/Still`. Do not infer new paths for these from
unrelated resources. Backup URLs retain the legacy layout.

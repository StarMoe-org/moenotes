# Release asset layout

Release assets come from the moenotes-assets service configured by `assetConfig.api`
(`https://assets.bdon.moe`, override with `PUBLIC_ASSET_API`). The service has no
path-based routes: files are served only as `/files/{file_id}` and export manifests as
`/exports/{export_id}`. The site never builds a URL from an asset path; it looks the
ID up in `src/lib/assets/generated`, and a path the index does not list resolves to
no URL, so the UI shows its unavailable state.

The service keeps one catalog per asset language (`zh-Hans`, `zh-Hant`, `en`, `ko`,
`ja`) for region `tw`. Each index value is a single ID when every language publishes
the same content, or an object keyed by asset language when content differs.
`selectReleaseId` walks the same language chain as `localizeMasterText`, so zh-CN
prefers `zh-Hans`, zh-TW prefers `zh-Hant`, and UI-only locales read English first.
Helpers for lettered artwork (band logos, banners, comics, stamps, titles, gacha
art, tickets, story banners) take the page locale; other callers default to zh-CN.

- `images.json`: logical PNG path without extension → lossless WebP file ID. The
  label must equal the key's last segment, so member-card `_atlas` paths select the
  original named image, not a face/formation crop.
- `stories.json`: script → table (`Episode`, `Text`, `Sound`, `SoundCueSheet`,
  `Video`) → JSON file ID. Only the story parser imports it. The existing parser
  accepts the tables' `_header` / `_allData` representation.
- `audio.json`: `Cri/Sound/<cue sheet>` → export ID. Shipping every cue's file ID
  would add roughly 0.9 MB (gzip) to story pages, so `loadReleaseAudio` fetches the
  sheet's manifest and matches cues by exact label. Labels whose files differ in
  content are ambiguous and resolve to nothing. The cue number is not adjusted.
  Stories load their cue sheets in `fetchAndParseStory`; songs load theirs at build
  time in `getBuildMusic`.

Downloads use `getAssetFileName` (`<asset name>.webp`) because file URLs carry no name.
`cachedFetch` stores `/files` and `/exports` responses, which are immutable per ID.

## Refreshing the index

```sh
node scripts/sync-release-assets.mjs            # --api=<url> --region=<id> to override
bun test tests/release-assets.test.ts tests/story-assets.test.ts
bun run lint
bun run check:search-seo
ASTRO_TELEMETRY_DISABLED=1 bun run check
```

The script reads each language's current catalog, lists its assets and fetches the
export manifest for every key in scope. No public route looks exports up by key,
so the script derives export IDs the way the service does:
`sha256(JSON.stringify([snapshot, key, "csharp-json-png-webp-aac-h264-v3"]))`.
Every manifest's `id`, `snapshot`, `key` and `profile` are checked, and a changed
profile fails the run. Published manifests are cached in
`node_modules/.cache/moenotes-assets`; a 404 means not exported (yet) and is not
cached. Existing file URLs stay valid after the service refreshes a catalog, so the
committed index keeps working until it is regenerated. Review and commit the
generated JSON along with any resolver changes.

## 2026-09-25 sync

Snapshots: `zh-Hant` 748b0982…, `zh-Hans` 206ab22b…, `en` 6624a60e…, `ko` e3dcf8eb…,
`ja` cb158e12…. The index lists 1,841 images (167 differ by language: band logos
for bands 3 and 5, banners, comics, stamps, titles, backgrounds, tickets, story
banners and icons, gacha banners and logos, the season pass banner and login bonus
sheets), 946 stories with 4,730 tables, and 937 cue sheets. Story tables and audio
are identical in all five languages.

Checks against the live host: all 2,471 image file IDs returned `image/webp` and all
4,730 table IDs `application/json`. `adv_script_mygo_001_1_01` parsed into 115
lines with 110 voice links, and sampled voice/BGM/SE files returned `audio/mp4`.
Compared with the old bucket, sampled images had identical dimensions and visible
pixels within 1/255.

Known gaps: `MemberCard/30/member_character` and one ACB sheet have no export;
`Fwk.Sound.SplitAcbData` resources and member-card USM movies are not exported.
Only `_short` song versions exist, so songs get preview audio but no full track.
The service lists ADV `Adv/Stage` / `Adv/Still` textures, but they are not in the
image scope yet, so story backgrounds and stills still resolve to nothing.

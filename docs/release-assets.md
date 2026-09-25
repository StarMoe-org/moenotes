# Release asset layout

Release assets come from the moenotes-assets service configured by `assetConfig.api`
(`https://assets.bdon.moe`, override with `PUBLIC_ASSET_API`). The site builds every
asset URL from its path; there is no generated index or sync step, so files the service
exports appear without rebuilding the site.

```text
{api}/{language}/{key}/{label}.{ext}
https://assets.bdon.moe/zh-Hans/Character/Image/11/character_face_icon/character_face_icon.webp
https://assets.bdon.moe/ja/Cri/Sound/A_Abracadabra/A_Abracadabra.m4a
https://assets.bdon.moe/zh-Hans/Cri/Sound/A_Abracadabra/        (lists the key's files)
```

The service maps a path onto the newest snapshot that has published the key and answers
404 for anything not exported. Path responses use a 10-minute cache with the content
ETag; see the service's `docs/API.md` (Path routes).

- **Language**: `assetLanguage` takes the locale's first MasterText language (zh-CN →
  `zh-Hans`, zh-TW → `zh-Hant`, ja-JP → `ja`, ko-KR → `ko`, everything else → `en`).
  Most files are identical in every language; lettered art (band logos, banners, comics,
  stamps, titles, gacha art, tickets, story banners) differs, so those helpers take the
  page locale. Other callers default to zh-CN.
- **Images**: a MasterData PNG path becomes `<key>/<basename>.webp` (lossless WebP).
  Member-card `_atlas` paths name the original full image, not a face/formation crop.
- **Story tables**: `Adv/Episode/<script>/<script>-<table>/<script>-<table>.json`; the
  parser accepts the tables' `_header` / `_allData` representation.
- **Audio**: `Cri/Sound/<cue sheet>/<cue>.m4a` by exact cue name; the cue number is not
  adjusted. BGM and SE sheets publish one cue named after the sheet. Full songs
  (`Fwk.Sound.SplitAcbData`) and previews (`*_short`) resolve the same way.
- **Story scenes**: the reader shows backgrounds (`Adv/Stage/<name>/data/<name>`), stills
  (`Adv/Still/<dir>/data/<name>`), clips and phone chats between the lines. Clips are
  `Cri/Video/<asset>/<name>.mp4` (the script's `-Video` table names the asset; the same
  file in every language); their subtitles are the script's command-28 rows, timed by the
  durations of the blocking rows between them (the sums match the MP4 lengths to about a
  second) and attached to the player as a WebVTT track. Chat avatars
  are `Adv/Chat/Icon/<icon>/<icon>.webp` from `MasterAdvChat`. Solid black/white stages
  (217, 218, 333) are treated as scene breaks. Anime-still captions come from
  `MasterBiliAnimeStillSubTitle` (optional; skipped for Japanese).

Because URLs are built rather than looked up, the site cannot tell in advance whether a
file exists. A missing file fails to load (images fall back where the component handles
errors; a voice line without an export fails when played). Downloads take the file name
from the URL (`member_full.webp`, `<title>.m4a`). `cachedFetch` stores responses under the
language prefixes for offline/stale fallback; browser API listings use `no-store`.

In `astro dev`, build data is memoized on `globalThis` and survives hot reloads; restart
the dev server after changing how asset URLs are built.

Known gaps (2026-09-25): `MemberCard/30/member_character` and one ACB sheet have no
export; member-card USM movies are not exported. The CDN in front of the service does not cache
responses of 400 and above, so a path requested before its export resolves once the export
is published (it previously cached 404s for a year). 21 yumemita
chapter-1 stills (`adv_still_anime_000194`–`000299`, `adv_still_charaillust_000028`) are
referenced by scripts but absent from the catalog; the reader hides them.

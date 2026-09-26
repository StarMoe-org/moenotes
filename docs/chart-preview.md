# Chart preview (3D)

`/tools/chart-preview` plays a chart with [ournotes-player](https://github.com/StarMoe-org/ournotes-player)
(WebGL2 + WebAudio, auto play). The song detail page links each difficulty to it as
`/tools/chart-preview?music=<musicId>&difficulty=<easy|normal|hard|expert>`.

## Data

The player does not read our release assets: besides the score it needs the live scene, note skins, effects,
shaders and sounds. It reads a static **chart site** published by moenotes-assets at `/chart-site/`
(`chart-site` command / `POST /chart-site/build`, see its `docs/CHART_SITE.md`):

```text
{chartSite}/charts/<musicId>_<difficulty>.json   chart manifest (musicId = MasterLiveMusic id)
{chartSite}/assets/<sha256>.<ext>                content-addressed files shared by all charts
```

`assetConfig.chartSite` (`src/config/assets.ts`) is `https://assets.bdon.moe/chart-site`; override it with
`PUBLIC_CHART_SITE`. The stage, note and effect files come from an [nnnotes](https://github.com/empty-sekai/nnnotes)
`web` build (the static base); moenotes-assets adds every song the base lacks from its own exports (score, BGM, sound
definition, jacket), so new songs need no new base. The service serves assets immutable and manifests for 60 s; its
`cors_origins` must allow this site's origin.

Build the base with the same player commit as the `ournotes-player` dependency in `package.json`.
A chart is about 40–45 MB, mostly shared stage, note and effect files, so a second chart downloads much less.

## Frontend

- `ournotes-player` is a git dependency pinned to a commit and imported dynamically by
  `src/components/tools/ChartStage.tsx`, so it only loads on the preview page. moenotes is AGPL-3.0, like the player.
- The stage frame carries the Moenotes signature and is what goes fullscreen, so the signature stays on the picture.
- Songs are chosen in `MusicSelectDialog` (`src/components/music/`), a generic song + difficulty picker: a modal with
  the music list's full filters (`useMusicFilters` / `MusicFilters`, shared with the music list) and every song.
  Picking closes the dialog and loads the chart.

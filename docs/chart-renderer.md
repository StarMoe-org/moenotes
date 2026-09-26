# Chart preview (moenotes-chart-renderer)

Song detail pages draw a difficulty's chart as one PNG sheet with
[moenotes-chart-renderer](https://github.com/StarMoe-org/moenotes-chart-renderer), a Rust + Skia
renderer compiled to WebAssembly (`wasm32-unknown-emscripten`).

## How it runs

- `src/components/music/ChartSheetDialog.tsx`: the sheet of one difficulty in a dialog, opened by the **2D
  preview** button of a difficulty on the song detail page. It draws on opening (a sheet already drawn is shown
  again); inside, difficulty and theme pickers redraw, the viewer pans and zooms (drag, wheel/pinch, double-click,
  keyboard) and the header button downloads the PNG.
- `src/lib/music/chart-renderer.ts` starts one module worker per page on first use;
  `chart-render.worker.ts` instantiates the SDK once and transfers each PNG back.
- The page fetches the chart (`Live/MusicScore/<chartKey>/<score>.json`) and the jacket's **PNG**
  export from the asset service with `fetchReleaseBytes`, so the IndexedDB asset cache applies. The
  WASM Skia build has no WebP decoder; an undecodable or missing jacket falls back to a sheet without
  a cover. `chartKey` is `MasterLiveMusicScore.musicScoreTextFileName` (e.g. `0069/0069_03`).
- Sheet header text (title, localized difficulty, level, band, credits, master FC) comes from
  masterdata via `getChartSheetMetadata`; the renderer does no lookups.
- Rendering is at the renderer's native size with 2x supersampling (a few seconds for an Expert
  chart). A memory failure retries once at 1x supersampling.

The module is ~22 MB (~8 MB compressed). Vite emits it as a content-hashed `/_astro/*.wasm` asset;
`docker/Caddyfile` compresses it and marks `/_astro/*` immutable.

## Updating the renderer

The SDK is vendored in `src/vendor/moenotes-chart-renderer/`, with its commit and build recorded in
`SOURCE.json`. The upstream WASM build needs a Unix host with Emscripten, so the sync script takes
the SDK from the upstream CI artifact by default and checks every file against the SDK's
`manifest.json` hashes:

```sh
bun run sync:chart-renderer                       # latest successful CI run on main (needs `gh`)
bun run sync:chart-renderer -- --run <id>         # a specific CI run
bun run sync:chart-renderer -- --from ../moenotes-chart-renderer/dist/wasm --commit <sha>
```

The last form takes a local `python3 scripts/build_wasm.py --emsdk <path>` output. The script also
copies `renderer.d.ts` to `renderer.d.mts`, which TypeScript uses to type the `renderer.mjs` import.
Licences for the embedded fonts, Skia and Emscripten stay beside the module in the vendor directory
and are linked from the page through the upstream repository.

The sheet's masthead and footer carry the moenotes signature logo, drawn by the renderer from the
vector paths of its `assets/brand/moenotes-signature.svg` (a copy of
`public/assets/brand/moenotes-signature.svg`). If the logo changes, update both files.

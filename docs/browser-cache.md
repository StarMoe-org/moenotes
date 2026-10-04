# Browser cache

What the site keeps in the visitor's browser, and what the settings' **Data** tab (`DataSettings` in
`src/components/shell/SettingsDrawer.tsx`) shows and clears. Nothing here is required: without IndexedDB, Cache
Storage or service workers every file simply downloads again.

## Stores

| Store | Where | What | Budget |
|---|---|---|---|
| Player files | IndexedDB `moenotes-cache`: `player-files` + `player-file-info` (`src/lib/cache/player-files.ts`) | The content-addressed `assets/` files of the story site and the chart site: stories, Live2D models, 3D charts | `cacheConfig.playerFiles` (2 GB, at most half the quota), least recently used out first |
| Images | Cache Storage `moenotes-images-v1`, filled by the service worker `public/sw.js` (`src/lib/cache/images.ts`) | The pages' images from the asset service (`<img>`, CSS backgrounds) | `cacheConfig.images` (256 MB), kept longest ago out first |
| Release assets | IndexedDB `assets` (`src/lib/cache/asset-cache.ts`, `cached-fetch.ts`) | `fetch()` answers of the asset service: JSON, and images and audio fetched by script | `cacheConfig.assets` (150 MB, 300 entries), 7 days fresh |

The chart-data tool also keeps the complete `music-data.json` response in the existing `assets` store, under a
separate key for its source URL. This mutable file is fresh for **five minutes**, with no stale-on-error fallback;
reloads within that window reuse its Blob rather than downloading it again. Its provenance and replay reference
remain part of that same validated snapshot. The parsed object is reused in memory, and concurrent reads share one
load. A reader's abort rejects only its own wait; the shared load may finish and warm the cache. Corrupt, incompatible
or expired cache entries fall back to a fresh request. Writes run in the background, and unavailable storage falls
back to memory and network. The developer cache-bypass switch skips this cache too. This does not change the release
assets' seven-day policy or add caching to replay JSON/WASM resources. The deck solver reads `music-data.json` through the same
loader when `build.json` names no replay manifest; its Worker downloads the deck data and engine files with the
browser's HTTP cache only (deck-worker.md).

## Categories

Each player file is stored with its **kind**, what it is. The player file fetch learns it from the manifests it fetches
before the player asks for the files (`classifyManifestFiles`; story paths by `storyFileKind`), so a model file is
Live2D whether the viewer or a story loaded it. A file no manifest named keeps its player's kind
(`createPlayerFileFetch(fallback)`). Files kept before kinds existed carry the tool that loaded them (`source`) and count
by it until a manifest names them again; the next read corrects the stored kind.

| Kind | Files |
|---|---|
| `live2d` | every file a model manifest (`models/<id>.json`) lists: the Live2D viewer's models and a story's |
| `background` | story files `textures/adv_bkg_*`, `textures/adv_still_*` and `host/spot/*` (a home spot's 3D room) |
| `voice` | story files `audio/adv_voice_*`, `audio/VoiceSystem_*`, `audio/spot_*` |
| `sound` | the other story `audio/` files (music, sound effects, their cue sheets) |
| `story` | the rest of a story: fonts, UI, shaders, scripts |
| `chart` | the 3D chart previewer's files |

The Data tab groups the stores into fewer **categories** (`src/lib/cache/usage.ts`, in `CACHE_CATEGORIES` order). The
player file kinds map through `PLAYER_KIND_CATEGORIES`, the release assets by content type (`assetCacheCategory`):

| Category | Player file kinds | Also |
|---|---|---|
| `live2d` | `live2d` | |
| `images` | `background` | the image cache, release assets `image/*` |
| `audio` | `voice`, `sound` | release assets `audio/*` |
| `chart` | `chart` | |
| `data` | `story` | the other release assets (JSON) |

Each category has a fixed color, `--mn-cache-<category>` in `src/styles/tokens.css` and `themes.css`: the dataviz
reference categorical palette in its validated order, its dark steps for the dark theme. The bar above the list splits
the total by category; the list names every category with its size, so the bar is hidden from assistive technology.
Hovering a segment or a row brings out both. A new category needs a token in both files and
`settings.data.categories.*` / `settings.data.categoryHints.*` in the core locales (a test checks both).

## Image service worker

`public/sw.js` is served at `/sw.js` (the static server sends it with `no-cache`, so updates are picked up) and
registered with scope `/` by `registerImageCacheWorker` (`src/lib/cache/service-worker.ts`, from
`AssetCacheBootstrap.astro`) after the page has loaded. The script URL carries `cacheConfig.images` and the prefix of
the images to keep (`assetConfig.api`); a changed URL installs the worker again.

- It answers only `GET` image requests under that prefix. Every other request, and any failure, goes to the network as
  it would without it.
- An `<img>` request is no-cors, and its opaque answer can be neither measured nor kept at its size. The worker fetches
  the image again as a CORS request (the asset service allows any origin) with `cache: "no-cache"`. An image already in
  the HTTP cache, stored from a no-cors request without CORS headers, is then revalidated with a 304 rather than
  downloaded.
- A kept image older than `ttlMs` (7 days) is still shown, and fetched again in the background: a new export can
  replace the image at the same address.
- Each kept response carries `x-moenotes-size` and `x-moenotes-stored-at`. The page reads the sizes for the usage, and
  the worker uses both for eviction (10 s after the last image is stored, and on activation).
- Setting the developer switch `moenotes:asset-cache-bypass` to `true` in localStorage unregisters the worker on the
  next page load. To retire it for everyone, publish a `sw.js` that only unregisters itself.

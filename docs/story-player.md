# Story player

`/tools/story-player` plays the game's story episodes (ADV) with [ournotes-player](https://github.com/StarMoe-org/ournotes-player)'s
story player (`ournotes-player/story`): the stage, Live2D characters, camera and effects, the talk window, music, sound
effects and voices, as the game's story screen shows them. `?story=<advId>` opens one episode (the address follows the
episode shown). Story pages (`/story/:id`) and the other talks' reader dialog link to it ("Live2D 播放") when the story
site has the episode.

Components: `src/components/tools/StoryPlayer*`, `StoryStage.tsx`, `StoryControls.tsx`, `StoryPickerDialog.tsx` and
`story-icons.tsx`; the story pages' link is `src/components/story/StoryPlayerLink.tsx`. Data and helpers in
`src/lib/story/player-data.ts` (pure), `player-settings.ts` (volumes, speeds) and `player-client.ts` (network, page
scripts); copy `storyPlayer.*`.

## Data

The episodes come from the **story sites** in the storage bucket, one per game region: the international site
(`assetConfig.storySite`, `PUBLIC_STORY_SITE`, default `https://storage.bdon.moe/moenotes`; TW/HK/MO, every text
language) and the JP site (`assetConfig.storySiteJp`, `PUBLIC_STORY_SITE_JP`, default
`https://storage.bdon.moe/moenotes/jp`; Japanese only, JP-only episodes such as the event stories). They are separate
sites because JP Live2D model ids overlap the international ones. The server reads each regional index, matches entries to that region's MasterData, and returns only officially released
stories through `/api/v1/story-site/index`. The browser receives same-origin proxy roots, not the storage bucket URLs;
an episode on both sites remains associated with its source region. Each site is the layout `nnnotes web` writes (the
format is ournotes-player's `docs/story-data-format.md`, manifests `ournotes.story-manifest/2`):

```text
{storySite}/stories.json                 story index (ournotes.stories/1: titles, languages, sizes), read at runtime
{storySite}/stories/<advId>.json         story manifest the player loads (common files + one group per language)
{storySite}/models/<id>.json             the Live2D models the stories reference (format /2)
{storySite}/assets/<sha256>.<ext>[.gz]   content-addressed files; .gz ones the player decodes itself
```

The site is kept up to date by the `story-site` workflow of StarMoe-org/nnnotes (its `.github/STORY_SITE.md`):
moenotes-masterdata-sync dispatches it when new master data is served, and it builds and uploads the stories the
bucket lacks. The bucket's CORS allows `https://bdon.moe` (and `http://localhost:4321` for the dev server); a preview on another
origin needs that origin added there.
The player version (`ournotes-player` in package.json) must read what that workflow writes (`STORY_PLAYER_REF` there).

- The picker intersects the filtered cloud index with the locally built story catalog (`getBuildStories`: names, groups,
  episode numbers and banners, localized at build time). Cloud-only rows are omitted because cloud presence is not proof
  of an in-game release. `/api/v1/story-site/index` checks the same-region MasterData release date and rejects unknown,
  missing-date and malformed-date records. The global picker stays locked until every region that lists a story has
  officially released it. Chapter and episode artwork keep their source server; entries played from the JP site use the
  JP Japanese asset catalog.
- A `?story=` is only an id hint: unknown or unreleased ids are never fetched directly from a cloud manifest. The
  story-scoped `/api/v1/story-site/{tw|jp}/stories/{advId}.json` proxy repeats the regional MasterData check, validates
  the upstream manifest's `advId` and region, and only serves content-addressed assets and model manifests listed by
  that episode's manifests. The proxy rewrites the story root so the player loads those resources through the same
  gate. This intentionally drops the previous early-manifest shortcut, where the storage workflow could publish a
  manifest before rewriting `stories.json`. The story-page link checks the filtered regional index instead of probing a
  public manifest with `HEAD`.
- The story starts in the first of the locale's text languages that the episode has (masterdata's order,
  `assetLanguageOrder`); the controls' labels follow the locale. Switching the language in the header goes through
  the player (`setLanguage`: it loads that language's files and restarts at the current line), not a reload.
- A story's `assets/` files, its models' included, are kept in the browser once downloaded (`storyPlayerFetch`: the
  player file cache of `src/lib/cache/player-files.ts`), so replaying an episode or switching its language fetches only
  the manifests again. The settings' Data tab shows what is kept (backgrounds with the images, voices and music with the
  audio) and clears it ([browser-cache.md](browser-cache.md)).

**Deployment limitation:** the same-origin proxy gates requests made through this site, but the configured storage
bucket is still publicly addressable. This repository cannot prevent a caller from requesting a known raw
`{storySite}/stories/<advId>.json`, `{storySite}/models/<id>.json`, or `{storySite}/assets/<hash>` URL directly. To satisfy
a no-direct-link guarantee, the bucket/CDN must also deny public reads (or serve gated URLs only); until that is changed,
release protection is not complete outside the Moenotes application.

## Layout

- The header shows the episode's banner, group and title (a link to its story page), its size in the chosen language,
  the previous / next episode, the language (a dropdown), the help dialog (ⓘ) and the picker (a dialog: the three
  lists, a search over all of them, the current episode marked).
- The stage is the player's own root without its control bar (`controls: false`), 13:6 (the game's ADV viewport);
  the frame goes fullscreen. The signature is the light logo SVG (the story screen is dark).
- `StoryControls` lies over the stage's bottom: play / pause, next line, auto, fast-forward (×1 → ×1.5 → ×1.7 → ×2),
  skip (with its confirmation, which holds the playback), the line bar (a seek restarts at that line) and a video bar
  while a movie or clip plays, settings and fullscreen, all as SVG icons. It hides while the story plays and the
  pointer rests (touch screens bring it back with the button at the top right). The settings panel holds the music,
  sound effect, voice and video volumes with their mute switches (kept in this browser) and the fast-forward speed.
  A tap on the story screen is the next line; keys: Space / Enter next line, A auto, F fast-forward, K play / pause.
  An Overlay episode (home spot and post-live talks) has no auto and no fast-forward, as in the game.
- The end of an episode offers to play it again or to go on to the next one.
- An episode that needs what the player does not reproduce yet is refused before loading (`StoryCommandError`); the stage
  says so and names the part, instead of showing it wrongly.

## Page scripts

ournotes-player bundles none of these; each is its maker's software under its own license, loaded as a classic script
before the first story (`loadStoryRuntimes`):

| Script | Config | Needed for | Without it |
|---|---|---|---|
| Live2D Cubism Core for Web | `PUBLIC_CUBISM_CORE` (Live2D's distribution by default; shared with the Live2D viewer) | every story | the story does not load |
| CRI Core of Live2D's MotionSync plugin (`live2dcubismmotionsynccore.min.js`, 5.0.4) | `PUBLIC_CUBISM_MOTIONSYNC_CORE` (default: the copy in the storage bucket, `vendor/cubism-motionsync-core-5.0.4/`) | voice lip sync of models with a MotionSync controller (most story models) | those mouths stay still while speaking (the others use the story data's CRI Lips analysis) |
| Spine 4.2 spine-core build defining `spine` | `PUBLIC_SPINE_RUNTIME` (unset by default) | the characters of home spot talks | the spot is drawn without them; the talk plays |

The MotionSync Core is Redistributable Code of the Live2D Proprietary Software License Agreement, which bdon.moe
accepted: the bucket serves Live2D's file as is (sha256 `60e2a8ba9b422a0f8a3d7e066739352e9b903cc1011339984ad922e80a3cd19a`,
from the Cubism SDK for Web MotionSync Plugin; the player accepts Core 5.0.4 only) under a versioned path with a
year-long cache. It is not committed to this repository. The help dialog credits it and links the agreement, or says
that voice lip sync is missing when the script does not load. Another deployment serving it must accept Live2D's
agreement itself. Serving the Spine runtime is a licensing decision of the deployment.

## Checking a change

The bucket answers CORS for `https://bdon.moe` and the dev server's `http://localhost:4321`, so `bun run dev` plays the
bucket's stories; another origin reads a local copy of a few stories (`PUBLIC_STORY_SITE=http://127.0.0.1:8787`,
serving an `nnnotes web` site directory with CORS). Open `/tools/story-player?story=<advId>`. After bumping the
`ournotes-player` dependency, check that a story loads and plays, that a language switch keeps the stage, and that the
controls still drive it (`StoryControls` uses the player's public API: play, pause, next, setAuto, setSpeed, skip,
seekToLine, seekVideo, setVolume, and the session's `setDialogOpen` for the skip confirmation).

The player gives every uGUI draw of the story (screen canvases, story UI, chat) the values the engine sets outside the
canvas: `_RendererColor`, `unity_SpriteColor`, `unity_SpriteProps` and `_GlobalMipBias` (`UIDraw.spriteGlobals`). A URP
2D Shader Graph on an Image reads them: the grayscale layer of the anime stills (`Graphs_UIGrayscale`, nine Ave Mujica
episodes such as ADV 10021) stops the story without them. `tests/story-player-canvas-globals.test.ts` covers it.

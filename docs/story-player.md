# Story player

`/tools/story-player` plays the game's story episodes (ADV) with [ournotes-player](https://github.com/StarMoe-org/ournotes-player)'s
story player (`ournotes-player/story`): the stage, Live2D characters, camera and effects, the talk window, music, sound
effects and voices, as the game's story screen shows them. `?story=<advId>` opens one episode (the address follows the
episode shown). Story pages (`/story/:id`) link to it ("Live2D 播放") when the story site has the episode.

Components: `src/components/tools/StoryPlayer*` and `StoryStage.tsx`; data and helpers in `src/lib/story/player-data.ts`
(pure) and `src/lib/story/player-client.ts` (network, page scripts); copy `storyPlayer.*`.

## Data

The episodes come from the **story site** in the storage bucket (`assetConfig.storySite`, `PUBLIC_STORY_SITE`, default
`https://storage.bdon.moe/moenotes`), the layout `nnnotes web` writes (the format is ournotes-player's
`docs/story-data-format.md`, manifests `ournotes.story-manifest/2`):

```text
{storySite}/stories.json                 story index (ournotes.stories/1: titles, languages, sizes), read at runtime
{storySite}/stories/<advId>.json         story manifest the player loads (common files + one group per language)
{storySite}/models/<id>.json             the Live2D models the stories reference (format /2)
{storySite}/assets/<sha256>.<ext>[.gz]   content-addressed files; .gz ones the player decodes itself
```

The site is kept up to date by the `story-site` workflow of StarMoe-org/nnnotes (its `.github/STORY_SITE.md`):
moenotes-masterdata-sync dispatches it when new master data is served, and it builds and uploads the stories the
bucket lacks. The bucket's CORS allows `https://bdon.moe`; a preview on another origin needs that origin added there.
The player version (`ournotes-player` in package.json) must read what that workflow writes (`STORY_PLAYER_REF` there).

- The list shows the build's story data (`getBuildStories`: names, groups and episode numbers, localized at build time)
  for the episodes `stories.json` lists, in the story pages' order; episodes the build does not know yet are listed
  last by the site's own titles.
- A `?story=` the index does not list is opened from its manifest (its `story` block is the index entry): a site build
  publishes each manifest as it lands and rewrites `stories.json` at its end. The story page's link checks the manifest
  the same way (a `HEAD`), so it never leads to a missing story.
- The story starts in the first of the locale's text languages that the episode has (masterdata's order,
  `assetLanguageOrder`); the control bar's labels follow the locale. Switching the language in the panel goes through
  the player (`setLanguage`: it loads that language's files and restarts at the current line), not a reload.

## Layout

- The stage is the player's own root (canvas and control bar in its shadow root). Its box is 13:6 (the game's ADV
  viewport) plus the control bar's measured height, so the story screen needs no letterbox bands; the frame goes
  fullscreen. The signature is the light logo SVG (the story screen is dark).
- The panel beside the stage (under it on narrow containers, `@4xl`) shows the episode, its size in the chosen language,
  the languages, the previous / next episode, the link to the story page, and the controls' keys.
- The quick filter narrows the list by type (main, bond, post-live, home, tutorial) and text (title, group, characters,
  ADV id).
- An episode that needs what the player does not reproduce yet is refused before loading (`StoryCommandError`); the stage
  says so and names the part, instead of showing it wrongly.

## Page scripts

ournotes-player bundles none of these; each is its maker's software under its own license, loaded as a classic script
before the first story (`loadStoryRuntimes`):

| Script | Config | Needed for | Without it |
|---|---|---|---|
| Live2D Cubism Core for Web | `PUBLIC_CUBISM_CORE` (Live2D's distribution by default; shared with the Live2D viewer) | every story | the story does not load |
| CRI Core of Live2D's MotionSync plugin (`live2dcubismmotionsynccore.min.js`) | `PUBLIC_CUBISM_MOTIONSYNC_CORE` (unset by default) | voice lip sync of models with a MotionSync controller | those mouths stay still while speaking (the others use the story data's CRI Lips analysis) |
| Spine 4.2 spine-core build defining `spine` | `PUBLIC_SPINE_RUNTIME` (unset by default) | the characters of home spot talks | the spot is drawn without them; the talk plays |

The panel says which optional part is missing. Serving either optional script is a licensing decision of the deployment.

## Checking a change

The bucket answers CORS for `https://bdon.moe` only, so a dev server reads a local copy of a few stories
(`PUBLIC_STORY_SITE=http://127.0.0.1:8787 bun run dev`, serving an `nnnotes web` site directory with CORS) and opens
`/tools/story-player?story=<advId>`. After bumping the
`ournotes-player` dependency, check that a story loads and plays, that a language switch keeps the stage, and that the
stage's box still matches the control bar.

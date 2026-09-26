# Live2D viewer

`/tools/live2d` shows the game's Live2D models with [ournotes-player](https://github.com/StarMoe-org/ournotes-player)'s
model player (`ournotes-player/live2d`): idle motion, blinking, breathing and physics as in the story, with every motion
and expression of a model on demand. `?model=<id>` opens one model (the address follows the model shown).

Components: `src/components/tools/Live2DViewer*` and `Live2DStage.tsx`; data and helpers in `src/lib/live2d/`; copy
`live2d.*` (costume words `live2d.costume.*`).

## Data

The models come from the **model site** moenotes-assets publishes next to the chart site (its `docs/MODEL_SITE.md`):

```text
{chartSite}/models.json                  model index (id, group, character, sizes), read at runtime
{chartSite}/models/<id>.json             model manifest the player loads
{chartSite}/assets/<sha256>.<ext>        content-addressed files, shared with the charts
```

`models.json` is fetched in the browser (`src/lib/live2d/client.ts`), so a new costume appears without rebuilding the
site. Model ids are `[adv_]live2d_<name>_<NNN>_<costume>` for the 25 characters (`NNN` and the group `<NNN>_adv` /
`<NNN>_live` are the MasterCharacter id) and `adv_live2d_sub_<name>_<costume>` for side characters (group `sub_<name>`).
The master data has no costume names, so a costume is shown in words from the id (`school_winter_hs_1st` →
制服 · 冬 · 高中 · 一年级); `live2d.costume.*` names every word in use, other words are shown as the id spells them.
Live models' low quality copies (`_low`) are hidden unless the filter asks for them.

## Layout

- The quick filter (`BaseFilters`) finds a character: one `CharacterFilter` per band (single choice, `showAll={false}`),
  side characters as `FilterButton`s, the type (story / live / side), the search and the low quality toggle.
- The panel beside the stage switches the character's costumes (those the filter lets through), motions and
  expressions, physics and breath. It sits beside the stage only when the viewer's container is wide enough
  (`@4xl`), and under it otherwise, so an open filter drawer never squeezes the stage.
- A notice above the stage says what the viewer is: the game's own data, unedited; the browser rendering is not
  the game's final quality. The viewer deliberately offers no free parameter editing.

## Zoom

The wheel zooms about the cursor, a drag pans a zoomed model, two fingers pinch and pan, a double click or tap resets;
the stage's buttons do the same. The player fits the model into its drawing buffer with an orthographic camera and has
no view option, so `src/lib/live2d/view.ts` applies the view to the camera's view-projection matrix through the pinned
player's `ModelSession._globals` (the model stays sharp at any zoom; the mask texture is drawn in model space and is
unaffected). A player without that method falls back to a CSS transform. Check the zoom after bumping the
`ournotes-player` dependency.

## Live2D Cubism Core

The player needs Live2D Cubism Core for Web, which it does not bundle. The page loads `live2dcubismcore.min.js` from
`assetConfig.cubismCore` (Live2D's distribution by default; `PUBLIC_CUBISM_CORE` points it elsewhere, e.g. a copy on
our own CDN) before the first model. The Core is Live2D Inc.'s software under its own license; the credit under the
stage names it.

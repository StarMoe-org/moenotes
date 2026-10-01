# Native formation and card UI

The music section's **歌曲meta** page uses nnnotes' serialized `UIFormationListItem` and its companion `ournotes-player/ui` assembler. The original five `_slots` references determine the order. The third physical slot is Leader, matching the original serialized label and the TW native `SetLeaderHighlightFrame`/`LeaderMemberCardId` paths.

## Rendering and bindings

`NativeGameCard` loads a verified library, applies typed fixture edits through `UISession`, and renders with `UIPlayer`. The game owns the painted card frames, attribute icons, rarity gradients, character/background layers and Snap frames. The site's existing modal and filter components own selection, search, keyboard access and explanations.

The full group retains its original Quaternion rotations, depth and RectTransforms. Perspective comes from the serialized `UIFormationListView` Camera and its CanvasScaler reference resolution. Content framing removes transparent root-canvas margins. The renderer returns projected node quadrilaterals; selection buttons use those same regions instead of independently positioned hit boxes. Transparent quad projection uses WebGL2, with an inverse-homography CPU fallback. Deck scoring remains in the separate WASM Worker.

SSR portraits use the original foreground layer above the frame. R/SR portraits use the original background layer inside it. The game's R background getter reads `MasterBand._memberRarityRBackgroundAssetPath`; other rarities use the individual formation background. Formation artwork uses the character and background Sprite labels, not a flattened thumbnail.

Public Sprite images can be cropped to `textureRect`. Their bitmap dimensions are not the original `Sprite.rect`. The observed Sprite geometry sidecar supplies the original rectangle, offset and pixels-per-unit so the assembler restores the transparent logical canvas and native aspect ratio. `UISupportCardPresenter` also sets `AspectRatioFitter.m_AspectMode=4` at runtime; this edit is needed for square Snap pickers whose serialized mode is zero. Their original mask crops the wide Snap instead of stretching it.

Unknown member growth level or rank stays hidden. Reference members and selected skill levels are not an owned growth model. Hiding an occupied slot's outer gray background/outline is an explicit web presentation edit; it is not claimed as a native runtime rule. Original art, transforms and colored card frames remain in the source pack.

## Library contract and deployment

Configure `PUBLIC_GAME_UI_LIBRARY_TW` (and the corresponding JP/KR/EN variable only when a matching regional export exists) with a published `moenotes.game-ui-library/1` manifest URL. The local preview serves an ignored artifact directory. Game resource dumps and private configuration do not belong in this repository.

The manifest includes four prefab entries (`formationSlot`, `formationGroup`, `memberSquare`, `supportSquare`), exact binding catalogs, a Sprite geometry sidecar, and the original camera source. Each runtime file has a size and SHA-256 digest. Layout references pin the formation pack and camera; the loader checks region, client identity, file bytes and CanvasScaler resolution before activating the library. Gzip transport is compatible with this contract: hashes and declared sizes describe the decoded bytes returned by browser fetch.

The current observed library is TW client 1.0.1/build 25. Its legacy index lacks modern APK provenance; the manifest records that limitation instead of fabricating it. The static reference-resolution renderer does not certify Unity runtime pixel parity, custom camera matrices, motion, or current JP UI compatibility.

Reproducible upstream components:

- nnnotes [Sprite geometry producer Draft #16](https://github.com/MetaSekaiLab/nnnotes/pull/16), using `Exporter.sprite_render_data`, source catalog/bundle hashes and string-encoded 64-bit path IDs.
- ournotes-player [projection and Sprite restoration Draft #16](https://github.com/empty-sekai/ournotes-player/pull/16), applied as a small Bun patch over the published 0.1.6 UI module.

The producer accepts a frozen catalog and explicit keys: `nnnotes --config private.toml --catalog saved-catalog.bin sprite-geometries --keys selected-keys.json -o private-ui/sprite-geometries.json`. Keep observations of public bitmaps distinct from original Sprite metadata; matching labels or dimensions alone does not prove identical native pixels.

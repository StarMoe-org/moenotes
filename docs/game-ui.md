# Native formation and card UI

The music section's **歌曲meta** page uses nnnotes' serialized `UIFormationListItem` and its companion `ournotes-player/ui` assembler. The original five `_slots` references determine the order. The third physical slot is Leader, matching the original serialized label and the TW native `SetLeaderHighlightFrame`/`LeaderMemberCardId` paths.

## Rendering and bindings

`NativeGameCard` loads a verified library, applies typed fixture edits through `UISession`, and renders with `UIPlayer`. The game owns the painted card frames, attribute icons, rarity gradients, character/background layers and Snap frames. The site's existing modal and filter components own selection, search, keyboard access and explanations.

The full group retains its original Quaternion rotations, depth and RectTransforms. Perspective comes from the serialized `UIFormationListView` Camera and its CanvasScaler reference resolution. Content framing removes transparent root-canvas margins. The renderer returns projected node quadrilaterals; selection buttons use those same regions instead of independently positioned hit boxes. Transparent quad projection uses WebGL2, with an inverse-homography CPU fallback. Deck scoring remains in the separate WASM Worker.

SSR portraits use the original foreground layer above the frame. R/SR portraits use the original background layer inside it. The game's R background getter reads `MasterBand._memberRarityRBackgroundAssetPath`; other rarities use the individual formation background. Formation artwork uses the character and background Sprite labels, not a flattened thumbnail.

Public Sprite images can be cropped to `textureRect`. Their bitmap dimensions are not the original `Sprite.rect`. The observed Sprite geometry sidecar supplies the original rectangle, offset and pixels-per-unit so the assembler restores the transparent logical canvas and native aspect ratio. `UISupportCardPresenter` also sets `AspectRatioFitter.m_AspectMode=4` at runtime; this edit is needed for square Snap pickers whose serialized mode is zero. Their original mask crops the wide Snap instead of stretching it.

Unknown member growth level or rank stays hidden. Reference members and selected skill levels are not an owned growth model. Hiding an occupied slot's outer gray background/outline is an explicit web presentation edit; it is not claimed as a native runtime rule. Original art, transforms and colored card frames remain in the source pack.

## Library contract and deployment

TW defaults to the [published, version-pinned compact UI library](https://storage.bdon.moe/moenotes/game-ui/tw/0c7f77573ffb33957aa168cfd8816bf2d4a40ec67b87a26f188757a76e5132c2/manifest.json) in the existing storage bucket. Its directory is the manifest SHA-256. The manifest and 16 dependencies transfer 867,011 bytes: 532,936 bytes of PNGs and 334,075 bytes of gzip JSON. The original export was 35,700,327 bytes; the decoded compact library is 6,028,793 bytes. Native font files and glyph atlases are excluded. Local evidence paths are omitted from the public manifest.

Three UI atlases are repacked without resizing, rotation, quantization or alpha compositing. All 157 Sprite IDs and logical geometry are retained; the 152 repacked Sprite crops have identical RGBA texels. Five serialized prefab/camera documents retain their original nodes. The derived manifest records the source hash and updates all dependency hashes instead of claiming the entire original pack is unchanged. The renderer samples integer local crops around the original floating-point Sprite rectangle, keeping atlas dimensions out of its resampling coordinates.

The [publication run](https://github.com/StarMoe-org/nnnotes/actions/runs/36965273225) verified all 17 public objects, including transport and decoded hashes, sizes, MIME types and CORS. PNGs return one-year immutable caching. All nine JSON objects currently return `Cache-Control: max-age=0`, despite requesting one-year immutable caching through the existing S3 channel; no bucket or gateway policy was changed. The content-addressed URL and decoded SHA checks remain the version contract.

Override `PUBLIC_GAME_UI_LIBRARY_TW` with another published `moenotes.game-ui-library/1` manifest URL, or set it to an empty string to use ordinary artwork. Configure the corresponding JP/KR/EN variable only when a matching regional export exists. A local preview may instead serve an ignored artifact directory. Game resource dumps and private configuration do not belong in this repository.

Regions without a configured UI library keep the ordinary five-slot layout and existing member/Snap artwork components. Their selection buttons and selected cards remain visible, and they do not borrow another region's native library.

The full formation scales to its available container width, with selection directly on the five painted slots. The projected card quadrilaterals position the member and Snap controls. Below 560 pixels, Snap hit targets expand to the slot width and at least 44 pixels high for touch; the card artwork and camera geometry stay unchanged. Regions using ordinary artwork wrap their five slot cards into two columns on small screens.

Canvas text reuses the page's computed font family after the website fonts are ready. The player patch bypasses game TTF and SDF loading for this consumer; it preserves text content, size, color and layout while using browser glyphs. This is a web presentation choice, not native font or pixel parity. No additional font download is introduced.

The loader first verifies the required JSON documents, then loads only texture references used by Sprites or RawImages. It omits native fonts, glyph metrics and font-only atlases even from older manifests that still list them. A texture shared with a Sprite or RawImage remains required. Original pack files stay unchanged; the prepared in-memory pack drops font declarations, and a derived deployment manifest may omit those unused font files.

The manifest includes four prefab entries (`formationSlot`, `formationGroup`, `memberSquare`, `supportSquare`), exact binding catalogs, a Sprite geometry sidecar, and the original camera source. Each runtime file has a size and SHA-256 digest. Layout references pin the formation pack and camera; the loader checks region, client identity, file bytes and CanvasScaler resolution before activating the library. Gzip transport is compatible with this contract: hashes and declared sizes describe the decoded bytes returned by browser fetch.

New exports can include `dynamicSprites`, mapping each exact `addressable-key[decoded Sprite name]` to `{file,sha256,size,mime}`. Every record must match the manifest's file closure. Static prefab resources are verified once; dynamic gallery images are fetched and SHA-checked only when requested, with concurrent callers sharing the resulting blob. A configured dynamic directory replaces release URLs for member, Snap, background and band artwork before fixture assembly. Missing keys or a file mismatch fail rendering rather than selecting another version. Bundle-only requests, used for furniture, character icons and band logos, are accepted only when the exporter has narrowed that Addressables target to one actual Sprite. Geometry uses the resulting full key.

The current observed library is TW client 1.0.1/build 25. Its legacy index lacks modern APK provenance; the manifest records that limitation instead of fabricating it. The static reference-resolution renderer does not certify Unity runtime pixel parity, custom camera matrices, motion, or current JP UI compatibility.

Reproducible upstream components:

- nnnotes [Sprite geometry producer Draft #16](https://github.com/MetaSekaiLab/nnnotes/pull/16), using `Exporter.sprite_render_data`, source catalog/bundle hashes and string-encoded 64-bit path IDs.
- ournotes-player [projection and Sprite restoration Draft #16](https://github.com/empty-sekai/ournotes-player/pull/16), applied as a small Bun patch over the published 0.1.6 UI module.

The producer accepts a frozen catalog and explicit keys: `nnnotes --config private.toml --catalog saved-catalog.bin sprite-geometries --keys selected-keys.json -o private-ui/sprite-geometries.json`. Keep observations of public bitmaps distinct from original Sprite metadata; matching labels or dimensions alone does not prove identical native pixels.

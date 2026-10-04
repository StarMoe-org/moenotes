# Shared card box and deck workspace

`/account/box` maintains collection facts separately from `/tools/deck`. The deck page previews the flow with an explicitly labelled sample formation; it produces no scores or recommendations. The third physical slot is Leader.

Local boxes use IndexedDB with one key per server. Writes compare revisions and box identity in the same transaction. BroadcastChannel updates another tab; an editor opened on an older revision keeps its draft and requires reopening before saving. Temporary boxes use a shared in-memory session per server. Internal deck/collection navigation keeps that document alive; reload or leaving it discards the temporary copy. Changing destinations preserves current facts and merges an existing local copy. The UI saves either locally or for the current visit; it does not move local facts to an account automatically.

Fields retain independent `unknown`, screenshot observation, manual answer and conflict states, with evidence histories. Later screenshots cannot replace manual values. Independent conflicting manual branches require a decision. A resolution or explicit clear dominates its own old snapshot; clearing does not revive older values during merge. Rank and training use the documented 1–5 contract. Ordinary and Gekisou skills remain independent. Flow answers write back with `deck-answer` evidence. Ownership completeness and per-search exclusions are separate; excluding a card never removes it from the box.

The collection has one screenshot-import action, a five-step guide illustrated with card artwork from the asset service, and one menu for manual supplements, backup export/import, save location and deletion. Member, Snap, review and player-growth tabs share the same saved Box. Player growth is entered manually: character Rank, furniture ownership/levels, VIP and other player facts are not read from card-list screenshots. The guide's Rank badge is an explicitly labelled example. R/SR/SSR/BD/EX rarity comes from the Master entry of the identified card; numerical cultivation Lv. is a separate nullable fact.

## Screenshot import

Screenshot upload is the primary entry point. The browser decodes each image to local RGBA pixels; a classic Worker runs the BoxLens recognition models on ONNX Runtime Web (WASM): a locator finds every Member and Snap tile, a per-kind encoder identifies each tile's artwork against the gallery's reference embeddings, and per-kind readers read the visible level or training count and the card rank. Recognition runs entirely in the browser; screenshots are never uploaded or persisted. The original file's SHA-256 identifies the observation, and only confirmed facts enter the Box.

### Recognition runtime

The Worker (`public/recognition/recognition-worker.js`) and its modules (`pipeline.mjs`, `ort-runtime-loader.js`) are served by this site, because a Worker script must be same-origin. Everything else is read from the recognition site, `assetConfig.recognition.site` (`PUBLIC_RECOGNITION_SITE`, default `https://storage.bdon.moe/moenotes`): the storage bucket into which the recognition workflow of StarMoe-org/nnnotes publishes a new bundle when a server's Master data gains cards.

| Path | Content | Caching |
| --- | --- | --- |
| `recognition/current.json` | `{"format":"moenotes.recognition-pointer/1","bundle":{"sha256":"…","bytes":…}}`: the SHA-256 and size of the current bundle manifest | `no-cache`; revalidated before each import |
| `assets/<sha256>.<ext>` | Content-addressed files: the bundle manifest, the gallery manifest and its embedding buffers, the models manifest, ONNX Runtime Web (glue, module and WASM) and the seven ONNX models | Immutable |

The page reads the pointer, then the bundle manifest at `assets/<sha256>.json` and checks its size and SHA-256 against the pointer. The bundle manifest (`format: "moenotes.recognition-bundle/2"`) lists every file of the bundle by logical name with its path, size, SHA-256 and Content-Type; `entries.gallery` and `entries.models` name the gallery and models manifests. The page checks the gallery manifest the same way and hands the Worker the URLs and SHA-256 values of both manifests. The Worker checks each file it reads (manifests, embedding buffers, ONNX Runtime and the models) against the size and SHA-256 its manifest records before using it (`assetLengthMismatch`, `assetHashMismatch`); a mismatch stops the job. The bucket answers with `Access-Control-Allow-Origin: *`, so pages on any origin can read these files. A batch keeps the bundle it first loaded, and a newly published bundle applies to the next import. New cards need no change or deployment of this site. License notices are in `/recognition/licenses/`.

The gallery manifest (`format: "moenotes.embedding-gallery/1"`) has a `galleryId`, the SHA-256 of its canonical JSON without that field. `catalog` names the region and Master version of each server that contributed cards. Each card records its kind, decimal ID, `identity` (asset ID, character IDs, rarity and card type from Master), the `regions` whose Master has that identity and its `levelLimit`. `embeddings.member` and `embeddings.snap` each name the encoder that produced them, the embedding dimension, the gallery cards they cover and a buffer of unit-length float32 rows, one per card. File references (`file`) are `<sha256>.<ext>` names next to the manifest.

The models manifest (`format: "moenotes.recognition-models/1"`) names ONNX Runtime Web, the logical tile size of each kind and, for the locator and for each kind's encoder, field reader and rank reader, the model file and every crop size and acceptance threshold. The Worker reads all parameters from it.

### Recognition steps

1. **Locator.** The screenshot is resized (area averaging) so its long edge is 640 pixels and placed at the top left of a grey canvas padded to a multiple of 32. Local maxima of the per-kind heatmaps at or above the manifest threshold become tiles; tiles less than half inside the screenshot, and tiles covering more than half of a smaller higher-scoring tile, are dropped.
2. **Identity.** Each tile's artwork window (the tile less a 6-unit inset) is sampled bilinearly, with the edge pixels repeated outside the screenshot, at the encoder's input size. The embedding is compared by cosine similarity with the reference rows of the cards the selected server's catalogue shares with the gallery. The nearest card is accepted when its similarity and its lead over the second nearest reach the manifest thresholds; otherwise the tile stays unidentified, with the nearest card offered as a candidate for review.
3. **Fields.** When the level/field area lies inside the screenshot, the field reader classifies it: another parameter, a level from 1 to 100 (not above the identified card's level limit) or, for Members, a training count from 1 to 5. When the rank icon lies inside the screenshot, the rank reader reads the card rank from 1 to 5. Both accept only a confident top class with a clear lead; anything else stays unknown.

Unidentified tiles appear in the review as tiles cut from the screenshot, marked as not identified, with their nearest candidate. They are not saved until the player picks their card.

### Catalogue binding

One gallery serves every server: it holds the Member and Snap cards of the current Master of each published server. A gallery entry applies to the selected server when kind, decimal ID, asset ID, all character IDs, rarity and card type match that server's Master; matching IDs or a version label alone are not enough. The Worker matches tiles only against those cards; cards outside the gallery are picked or entered manually. Results describe the cards seen in a screenshot only; they do not establish the screenshot's server, its account or a complete inventory. `binding.datasetId` names the UI Master source of an observation.

The page transmits only the selected server's Master version and table-identity stamp. Its server-selected card catalogue is the single source for recognition and review: a single immutable projection keeps asset IDs, all character IDs, rarity and card type. A catalogue signature expires running jobs when those art references change within the same source stamp, and a mismatch names the card with its expected and actual art signature. Birthday and EX cards remain in the catalogue.

### Queue and review

Players can select, paste or drop multiple screenshots and append more without reopening the importer. Pasting or dropping image files on the collection workspace opens that same queue. Normal text paste in editable fields is retained. Each image has its own preview, progress, cancel and retry action. Images decode and run in sequence, transferring only the current RGBA buffer to its Worker. Preparation and recognition share a monotonic 90-second deadline per image. Preparation elapsed advances without Worker messages. Cancelling one image or stopping the remaining queue preserves successful observations. Retrying reserves a new job before decoding, so an earlier cancelled decode or error cannot occupy the new attempt. Server, catalogue, Box revision and dialog changes expire the batch. All four opaque string bindings must match before results can apply. Format, network, integrity, catalogue, decode and Worker failures remain distinct.

The review presents a selectable grid with larger game artwork, card titles and observed cultivation. Each result explicitly labels Member or Snap and its Master rarity. Snap review and Box artwork reuse the 16:9 `SupportCardArtwork` rather than cropping the landscape image into a member-like square; member artwork keeps its native square. Original screenshots and their frame overlays expand from the image queue. Identity correction and supplementary manual entry use the shared `CardFilters`, `CardViewSwitch`, member/support card items and square tiles. Card items expose a selection button while retaining their detail links on catalogue pages. Member square artwork follows the selected server's published native library, and birthday/EX cards use their own image path.

Once cards arrive, the upload area and image queue contract, and the first result enters the review viewport. Unread grid values use an accessible unknown label with a short dash. Cultivation correction uses the shared level and step controls; unknown stays nullable and an unknown level ceiling never creates a Max action. Hidden or clipped fields and skills do not acquire defaults. Cultivation values use the Master's 1–5 scale.

Successful images aggregate with one observation timestamp, preserving contradictory screenshot fields for explicit review instead of preferring completion order. Manual corrections made while later images run are merged back into the aggregate. Correcting an identity to an existing card combines both rows while retaining the edited row's key, both image regions, manual answers and field conflicts. Repeated photos retain their separate evidence and coalesce matching image regions. One save merges the selected cards into the Box without resetting manual answers, global facts, candidate exclusions or inventory completeness. Failed and cancelled images contribute no card facts. A prepare/begin deadline failure still publishes the exact current job's terminal state.

`scripts/verify-card-box-recognition-browser.mjs` runs the batch pipeline at 800 and 390 CSS pixels with three JP member-list screenshots (`member-training.jpg`, `member-performance.jpg`, `member-technic.jpg`) and records their SHA-256 values. It uploads several images plus an invalid JPEG, cancels and retries preparation, appends more images, corrects identities through the shared catalogue controls, and saves/reloads IndexedDB. It also corrects to an already-present identity and checks the combined evidence. Native square snapshots can be PNG images; verification waits for actual image decode and reads their painted pixels, rather than requiring every offscreen lazy tile to be ready. The first card must have a real visible intersection with the modal viewport and pass hit testing; the verifier does not scroll it into view itself.

Set `PLAYWRIGHT_MODULE` to a package name, absolute module path or file URL, `CARD_BOX_ORIGIN` to the running dev origin, `CARD_BOX_SCREENSHOT_DIR` to a directory with those screenshots, and `CARD_BOX_PROOF_DIR` to an ignored output directory. Screenshots are not part of the repository.

## Fixed comparison team

The deck flow keeps its steps, questions and sample result. At narrow content widths, typography, panel spacing and sidebars compact within the existing layout; tablet panels are not forcibly reordered. The Box and Deck have separate container scopes.

Skill questions default to independent answers. An ordinary answer never fills an unknown Gekisou level. Players can explicitly enable simultaneous entry; checking that control does not change facts, and the next edit to either skill writes both with separate evidence histories. Clearing follows the same explicit choice.

More options selects its comparison team through the shared catalogue controls and the owned-card subset. Five member slots require five distinct character IDs from the selected server's member view models. Choosing another card of an already-used character is disabled. Snaps only prohibit the same card ID twice; shared featured characters do not create additional restrictions. The third physical slot remains Leader. An empty Snap is a null team slot, distinct from clearing or asserting an unknown ownership fact. Saving keeps the five-member/five-Snap schema and does not add inventory or fill cultivation.

## Player facts

Player bonuses live in the same `Box.player`. `/account/box` exposes Player growth beside the Member, Snap and Review tabs. The deck's player panel edits that same record, revision and evidence history. Local mode persists cards and player facts together; temporary mode retains both only during the visit. JSON export and import include both. This requires no account or cloud storage. The panel draws its frames and value plates with CSS. See [player-factors.md](deck-design/player-factors.md) for the factors and their inputs.

The build generates a separate field catalogue for each of the four servers from its `MasterBandItem`, `MasterBandItemLevel`, `MasterCharacter`, `MasterCharacterRank`, `MasterVip` and `MasterText` rows. Item names use `nameTextId`, ordering uses `displayOrder`, and legal levels use level rows rather than the larger effect table. The catalogue and each answer have versioned source identities. Each server uses its own catalogue. Missing catalogues and unknown values remain unavailable; no no-furniture, maximum-level, character-rank or VIP defaults are introduced.

Furniture stores ownership and level separately. Selecting a legal level records owned; explicit not-owned removes the current level; clearing an already-owned level retains ownership and leaves its level unknown. The JP UI has no equipment-off or mutually-exclusive equipment assumptions. The generic catalogue can describe discrete values and explicit equipment rules when a catalogue supplies them. Partial input can always be saved.

`exportBandItemFacts` maps the box to the strict core contract:

```json
{"coverage":"partial","values":[{"id":101,"owned":true,"level":null},{"id":102,"owned":false,"level":null}]}
```

Box IDs stay decimal strings. `serializeBandItemFacts` validates i64 bounds and emits exact unquoted integer tokens without converting IDs to JavaScript `Number`. Core requests use this UTF-8 text and omit `player.bandItems`; field evidence and catalogue metadata are not part of the core payload. A known owned item with missing, conflicting or outdated level remains `owned:true, level:null`. The core, not the UI, reports missing evaluation facts and validates its dataset binding.

The Snap picker can filter candidates from the same box using known Snap rank bindings and member identities. It does not add guessed box bonuses to replay assumptions or label an incomplete collection as a personal recommendation.

Character ranks have their own completeness declaration. The total-rank input is an independent manual observation, whose legal interval comes from character and rank rows rather than the total-bonus threshold table. `exportPlayerRankFacts` omits unknown, conflicting or unbound character rows and exports partial coverage until every represented rank is known. Complete ranks allow the core to derive a total without writing a synthetic Box observation. VIP uses its positive Master ranks. `serializePlayerBonusFacts` supplies these same facts and furniture as an exact core player fragment; the strict resolver checks the dataset and reports missing or unmodeled memory/event effects.

## Rendering and verification

Card artwork and five-slot formations use the nnnotes prefab library and `ournotes-player/ui` assembler. Known levels and rank badges are passed into the prefab; unknown values are omitted. Region-matching `PUBLIC_GAME_UI_LIBRARY_*` exports are required for native prefab rendering. A manifest's `dynamicSprites` directory supplies SHA-checked images lazily for cards, character round icons, band logos and furniture. Keys use the Addressables target and decoded Sprite name, with original Sprite geometry retained for card assembly. A configured directory does not fall back to release artwork; UI resource errors are shown explicitly.

`scripts/verify-card-box-browser.mjs` accepts the local preview origin and an installed Playwright module:

```sh
PLAYWRIGHT_MODULE=/path/to/@playwright/test/index.mjs \
CARD_BOX_ORIGIN=http://127.0.0.1:4321 \
CARD_BOX_PROOF_DIR=/path/to/ignored/proof \
node scripts/verify-card-box-browser.mjs
```

Set `CARD_BOX_REQUIRE_NATIVE=1` with `CARD_BOX_NATIVE_MANIFEST` (a fetchable manifest URL) and `CARD_BOX_NATIVE_MANIFEST_SHA256` (the expected file digest), only with a matching library and dynamic directory. This additionally requires every card prefab and small game Sprite to finish rendering before screenshots are recorded. Without the flag the script checks behavior only, not native rendering. A same-origin relative `PUBLIC_GAME_UI_LIBRARY_JP` is supported for an externally exposed preview, so browsers do not receive a container-local hostname.

The script uses synthetic ownership facts and Master labels/IDs, verifies manual entry/import/export, level answering, furniture legality and ownership, snapshot expiry, IndexedDB CAS, cross-tab refresh, server isolation and memory-only mobile navigation. Viewports are 1440 and 390 CSS pixels. Anonymous analytics traffic is distinct from writes to the application/account API. Core i18n keys are supplied in all five core locales; non-core locales use the English fallback.

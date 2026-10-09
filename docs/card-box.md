# Shared card box and deck workspace

`/account/box` maintains collection facts separately from `/tools/deck`. The deck page reads those facts through the recommendation Worker; see [deck-worker.md](deck-worker.md). The third physical slot is Leader.

Local boxes use IndexedDB with one key per server. Writes compare revisions and box identity in the same transaction. BroadcastChannel updates another tab; an editor opened on an older revision keeps its draft and requires reopening before saving. Temporary boxes use a shared in-memory session per server. Internal deck/collection navigation keeps that document alive; reload or leaving it discards the temporary copy. Changing destinations preserves current facts and merges an existing local copy. The UI saves either locally or for the current visit; it does not move local facts to an account automatically.

Fields retain independent `unknown`, screenshot observation, manual answer and conflict states, with evidence histories. Later screenshots cannot replace manual values. Independent conflicting manual branches require a decision. A resolution or explicit clear dominates its own old snapshot; clearing does not revive older values during merge. Rank and training use the documented 1–5 contract. Ordinary and Gekisou skills remain independent. Flow answers write back with `deck-answer` evidence. Ownership completeness and per-search exclusions are separate; excluding a card never removes it from the box.

The primary import action opens the game-save flow even before the user signs in or uploads a save. It links the official StarMoe Box Android release and upload instructions, explains using the same Passport account, and offers a refresh after uploading. Screenshot import remains available beside it and inside the dialog. The screenshot guide and collection menu provide manual supplements, backup export/import, local save location and deletion. Member, Snap, review and player-growth tabs share the same saved Box. Without a linked save, player growth is entered manually: character Rank, furniture ownership/levels, VIP and other player facts are not read from card-list screenshots. The guide's Rank badge is an explicitly labelled example. R/SR/SSR/BD/EX rarity comes from the Master entry of the identified card; numerical cultivation Lv. is a separate nullable fact.

JSON backup import merges stored observations and restores the backup's save link and saved team when the device has none. An existing saved team is retained; a different linked player or save version requires source selection. A linked backup contains the save pointer, and reading that save uses the browser cache or the signed-in account's existing download access.

Downloaded saves are cached by save server, account ID and SHA-256. Each linked version can reopen independently after sign-out; matching account-keyed cache entries are read and migrated on access. Linking checks the current source before storing bytes and again before committing the link. Cache cleanup retains versions referenced by persistent and current-visit Boxes across servers, writes from the last minute and two additional versions per account for backup restoration.

## Account cloud sync

The cloud panel appears on both collection and deck pages. A signed-in account with a stable `/api/me.user.id` reads its private collection from `/api/me/boxes/{server}`. The local or temporary Box remains the editable working copy. "Save to account" explicitly uploads the stored Box; subsequent edits remain unsynced until saved again. Signing in alone never uploads local facts.

An existing cloud copy is reviewed before different local facts are saved. The user can merge both copies, replace cloud facts with the device copy, or use the cloud copy on the device. Merging retains conflicting manual evidence for review and keeps the device's saved team. Different linked game saves require an explicit source selection. Only `Box.save` is synced; the raw `_player` and derived save evidence never enter the Box request. Readers preserve both SIFT/NumberReader and encoder/classifier recognition provenance.

`CloudBoxClient` preserves the server's opaque revision string separately from the local numeric revision. PUT keeps the current cloud Box ID. Deletion is confirmed separately, leaves the device copy and uploaded game saves intact, and reads back the tombstone revision before any recreation. Missing cloud data is a successful null envelope; 404 or corrupt/unavailable responses are errors, never an empty collection.

`CloudBoxSync` retains the frozen mutation body and UUID after an uncertain network outcome, including an unreadable successful response. Retry sends that same operation. A 409 or a replay that reports a later device's changes keeps the working copy and asks for review. Every request carries `x-card-box-user`, the expected `/api/me.user.id`; the backend compares it to the authenticated session and rejects a mismatch with `409 stale_scope` before accessing any collection. This guards shared-cookie account changes in another tab without treating the header as authorization. The page refreshes its account state after that rejection. Account, server or Box-link changes invalidate in-flight responses; applying reviewed cloud data also checks the current local Box ID and revision so another tab's newer edits cannot be overwritten. The pending mutation exists for the current page lifetime; reloading starts with a fresh cloud read and review.

## Screenshot import

Screenshot upload is an alternative for a Box without a linked game save. The browser decodes each image to local RGBA pixels; a classic Worker runs the BoxLens recognition models on ONNX Runtime Web (WASM): a locator finds every Member and Snap tile, a per-kind encoder identifies each tile's artwork against the gallery's reference embeddings, and per-kind readers read the visible level or training count and the card rank. Recognition runs entirely in the browser; screenshots are never uploaded or persisted. The original file's SHA-256 identifies the observation, and only confirmed facts enter the Box.

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

## Game save import

A game save holds the player's whole collection, so a Box can read its cards and player growth from one instead of from screenshots. Saves are uploaded to the signed-in account with the StarMoe Box app and served by the account API (docs/account.md); `src/lib/account/game-saves.ts` is the client.

| Request | Answer |
| --- | --- |
| `GET /api/me/saves` | `{"saves":[{server, accountId, sha256, size, storedSize, uploadedAt, checkedAt, client}]}`, newest first |
| `GET /api/me/saves/{server}/{accountId}` | The save's `_player` object as uploaded, `ETag: "<sha256>"`; `If-None-Match` answers 304 |
| `DELETE /api/me/saves/{server}/{accountId}` | 204 |

`server` is `jp` or `intl`: one international client serves TW/HK/MO, EN and KR, so the `tw`, `en` and `kr` Boxes read `intl` saves and the `jp` Box reads `jp` saves (`gameSaveServer` in `src/config/account.ts`). `accountId` is the player ID shown in game, as decimal text; the picker shows it to tell several accounts apart. Signed out, the API answers 401 `signed_out`; an unknown save answers 404 `not_found`; a listed save whose bytes cannot be read answers 500 `save_unavailable`, which the page reports as temporary and offers to retry.

### Download and cache

The list holds upload metadata only. A save is downloaded when it is linked, automatically or from the picker; the page checks that its SHA-256 still matches the listed version and refreshes the list if a newer upload arrived in the meantime.

The page hashes the downloaded bytes with SHA-256 and accepts them only when the digest equals the SHA-256 the ETag names. Accepted bytes go to the IndexedDB database `moenotes-game-saves`, store `saves`, one record per `<server>/<accountId>` with the bytes, their SHA-256 and the upload time. A read hashes the bytes again and drops a record that no longer matches. A linked Box therefore opens after a reload and offline. When the linked version is not cached, the page downloads it, provided the account still holds that exact version. Unlinking removes the cached copy unless another server's Box in the same browser links the same account.

### Link

`moenotes.card-box/1` has a `save` field: `{"server", "accountId", "sha256", "uploadedAt"}` or `null`. A Box file without the field reads as unlinked. While a Box is linked:

- Members, Snaps, character ranks, furniture and memory come from the save and are shown read-only. Screenshot import, manual card entry, backup import and completeness declarations are unavailable; the card details dialog lists the values without editing controls.
- The Box keeps its screenshot and manual facts unchanged. They take effect again after unlinking.
- VIP rank is not part of a save; it stays a manual answer of the Box, as do events and profile ratings.
- The view is derived in memory on every load (`deriveGameSaveBox` in `src/lib/box/game-save.ts`). Derived evidence has the source `game-save` and is never written to a Box: `parseBox` accepts only screenshot, manual and deck-answer evidence.

### Uploaded saves first

Signed in, a Box reads the account's uploaded save without being asked:

- A Box without a link links the default upload of its save server (`defaultGameSave` in `src/lib/box/game-save-source.ts`): the save of a verified game account of the Box's server, else the save of the only player who uploaded. When several players uploaded and none is verified for that server, the page asks the user to pick.
- A linked Box follows newer uploads of the same player: when the list shows another SHA-256 for that player, the page downloads it, checks it, caches it and moves the link to it. The list is read on load, again when the linked version has left the account, and when the page becomes visible after at least 30 seconds.
- Unlinking records an opt-out for that server in this browser (`moenotes.box.own-facts.<server>` in localStorage). The Box keeps its own facts until the user links a save from the picker, which clears the opt-out.

"Check for updates" lists the account's saves again and offers the same move by hand.

### Reading a save

Only these fields of `_player` are read; the rest of the save is ignored:

| Field | Read as |
| --- | --- |
| `_memberCards[]` `_masterId`, `_exp`, `_awakeCount`, `_rank`, `_liveSkillLevel`, `_performanceSkillLevel` | One member card. `_performanceSkillLevel` is the Gekisou skill level. Awake count, rank and skill levels start at 1 and match the Box's 1–5 fields. |
| `_supportCards[]` `_masterId`, `_exp`, `_rank` | One Snap. |
| `_characters[]` `_masterId`, `_exp` | A character's rank. |
| `_bandItems[]` `_masterId`, `_level` | Furniture; level 0 is not built. |
| `_memory` `_musicGroups[]` (`_id`, `_musics[]` with `_id`, `_unlockedScoreRank`), `_members[]` and `_supports[]` (`_id`, `_unlocked`) | Memory progress. |

Every list is complete: a card the save does not list is not owned, an unlisted character has experience 0, and an unlisted band item is not built. Long fields (`_masterId`, `_id`) are integers or decimal text, int fields are 32-bit integers, and a missing or `null` value is unknown.

Levels come from experience. A member card's `memberCardLevelGroup` (`MasterMemberCard`) selects its rows of `MasterMemberCardLevel`; a Snap's `supportCardLevelGroup` (`MasterSupportCard`) selects its rows of `MasterSupportCardLevel`. The rows are taken in order of their cumulative `exp` (stable for equal values), and the card's level is the last row whose `exp` does not exceed `_exp`. A character's rank is read the same way from the `MasterCharacterRank` rows in rank order. `src/lib/masterdata/save-tables.ts` builds this subset of each server's Master at build time and the page carries it.

Entries whose ID is not in the server's Master, repeated IDs and values out of range (a negative experience, a level that reaches no row, a count outside 1–5, a furniture level without a level row) stay unknown and are counted in the banner of the linked save.

## Deck account input

`src/lib/deck/account-envelope.ts` writes the account input of the deck core, `ournotes.account/1`:

```json
{"format":"ournotes.account/1","datasetId":"<sha256 of the deck data>","server":"intl","revision":"…",
 "coverage":{"_player._memberCards":"complete","_player._supportCards":"complete","_player._characters":"complete","_player._bandItems":"complete",
  "_player._memory._musicGroups":"complete","_player._memory._members":"complete","_player._memory._supports":"complete"},
 "assumptions":[],"declared":{"_vip":{"_rank":7}},"account":{"_player":{…}}}
```

The caller supplies `datasetId` and `server`. `declared` holds the Box's VIP rank, or `null` when it is unknown.

- **Linked save** (`gameSaveAccountJson`): `_player` is the downloaded save text itself, inserted by string concatenation, so int64 values above 2^53 keep every digit. Every coverage entry is `complete`, `assumptions` is empty and `revision` is the save's SHA-256.
- **Screenshots and manual answers** (`boxAccountJson`): `_player` is assembled from the Box. Unknown values are `null`. A known card level or character rank becomes the cumulative experience that level or rank needs, and an assumption records it with its path. IDs are written as integer tokens. Coverage follows the Box's declarations: member and Snap completeness, character-rank and furniture coverage, and memory as `complete` once its progress is answered.

The Worker run message carries this text as `accountJson` (`docs/deck-worker.md`); its answer has the format `ournotes-deck.account-recommendation/1`.

## Fixed comparison team

The deck flow keeps its steps, questions and sample result. At narrow content widths, typography, panel spacing and sidebars compact within the existing layout; tablet panels are not forcibly reordered. The Box and Deck have separate container scopes.

Skill questions default to independent answers. An ordinary answer never fills an unknown Gekisou level. Players can explicitly enable simultaneous entry; checking that control does not change facts, and the next edit to either skill writes both with separate evidence histories. Clearing follows the same explicit choice.

More options selects its comparison team through the shared catalogue controls and the owned-card subset. Five member slots require five distinct character IDs from the selected server's member view models. Choosing another card of an already-used character is disabled. Snaps only prohibit the same card ID twice; shared featured characters do not create additional restrictions. The third physical slot remains Leader. An empty Snap is a null team slot, distinct from clearing or asserting an unknown ownership fact. Saving keeps the five-member/five-Snap schema and does not add inventory or fill cultivation.

## Player facts

Player bonuses live in the same `Box.player`. `/account/box` exposes Player growth beside the Member, Snap and Review tabs. The deck's player panel edits that same record, revision and evidence history. Local mode persists cards and player facts together; temporary mode retains both only during the visit. JSON export and import include both. This requires no account or cloud storage. The panel draws its frames and value plates with CSS. See [player-factors.md](deck-design/player-factors.md) for the factors and their inputs.

The build generates a separate field catalogue for each of the four servers from its `MasterBandItem`, `MasterBandItemLevel`, `MasterCharacter`, `MasterCharacterRank`, `MasterVip` and `MasterText` rows. Item names use `nameTextId`, ordering uses `displayOrder`, and legal levels use level rows rather than the larger effect table. The catalogue and each answer have versioned source identities. Each server uses its own catalogue. Missing catalogues and unknown values remain unavailable; no no-furniture, maximum-level, character-rank or VIP defaults are introduced.

Furniture stores ownership and level separately. Selecting a legal level records owned; explicit not-owned removes the current level; clearing an already-owned level retains ownership and leaves its level unknown. The JP UI has no equipment-off or mutually-exclusive equipment assumptions. The generic catalogue can describe discrete values and explicit equipment rules when a catalogue supplies them. Partial input can always be saved.

Merging an empty partial furniture record preserves the other record's completeness declaration, including a complete empty collection. A partial record with furniture entries keeps merged coverage partial. Individual field evidence and conflicts are retained independently.

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

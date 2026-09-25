# Third-party components and local resources

Project-authored Rust code and original built-in vector skin: MIT (LICENSE).
The built-in skin and synthetic fixtures contain no game images or charts.

- `vendor/moenotes-chart-parser`: v0.3.0, MIT; exact upstream commit and source
  SHA-256 are in UPSTREAM.json. Its yyjson source is MIT with a separate notice.
  Parser source is copied unchanged, not reimplemented.
- `libz-sys` and the linked stock zlib: wrapper MIT/Apache-2.0, zlib license.
- `skia-safe` bindings: MIT; Skia: BSD-3-Clause plus bundled component notices.
  Cargo.lock pins wrapper/dependency versions. See the upstream Skia LICENSE and
  third_party notices distributed with its binary/source package.
- WASM uses the Emscripten runtime under its MIT/University of Illinois notices;
  the SDK package includes the toolchain LICENSE.
- Rust dependencies retain their upstream licenses as recorded in Cargo metadata.

Embedded fonts are unmodified files, not relicensed by this project's MIT license:

- DejaVu Sans / Bold: Bitstream Vera license, DejaVu changes public domain;
  notices in assets/fonts/LICENSE-DejaVu.txt.
- IPA Gothic 003.03: IPA Font License 1.0, full text in assets/fonts/ipag-LICENSE.txt.
- GNU Unifont / Unifont Upper 15.1.01: its OpenType name table declares dual SIL OFL 1.1 and
  GPL-2.0-or-later with font embedding exception. We use the SIL OFL option;
  retain the upstream copyright/name-table notice and OFL text with the font.

`assets/fonts/font-provenance.json` pins file hashes. Text/artwork rendered with
these fonts is not a modified font. No font files have been altered.

Game skins, covers, decrypted bundles, APKs, master snapshots and actual game
charts remain local external resources under output/ or in the research workspace.
They are not included in this repository's default package or release artifact.
An explicitly supplied external skin/cover is loaded locally; the renderer does
not claim ownership of those assets.

Master metadata is fetched separately from the user-selected source
https://github.com/StarMoe-org/moenotes-masterdata and pinned by commit/region/hash.
Do not describe a previously fetched snapshot as live-current without refreshing.

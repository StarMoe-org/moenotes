# Third-party: Material Color Utilities (bundled subset)

- `mcu-scheme.mjs`: bundled subset of `@material/material-color-utilities`
  v0.4.0 (Copyright Google LLC, Apache License 2.0, full text in `LICENSE`).
  Exports only `SchemeTonalSpot`, `SchemeVibrant`, `Hct`, `argbFromHex`
  and `hexFromArgb`; image quantization, scoring and temperature modules are
  tree-shaken away. Rebuild provenance is recorded in `SOURCE.json`.
- `mcu-scheme.d.mts` / `mcu-scheme.d.ts`: project-authored minimal type
  declarations for the bundled subset (same license as this project).

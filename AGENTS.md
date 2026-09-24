# Agent / contributor guide (MoeNotes)

## i18n workflow (read this first)

UI copy lives in `src/i18n/messages/*.ts`. Locale registry is `src/config/locales.ts`.

### Supported locales (in-repo)

| Locale | Path prefix | Role |
|--------|-------------|------|
| `zh-CN` | _(default, no prefix)_ | Product default / content authority for key inventory |
| `zh-TW` | `/zh-tw` | Traditional Chinese (UI + masterdata traditional field) |
| `ja-JP` | `/ja` | Core |
| `en-US` | `/en` | Core **and runtime fallback** |
| `ko-KR` | `/ko` | Core (UI + masterdata korean field) |
| `th-TH` | `/th` | UI locale (masterdata falls back en→ja→zh) |
| `id-ID` | `/id` | UI locale (masterdata falls back en→ja→zh) |
| `vi-VN` | `/vi` | UI locale (masterdata falls back en→ja→zh) |
| `es-ES` | `/es` | UI locale (masterdata falls back en→ja→zh) |
| `pt-BR` | `/pt` | UI locale (masterdata falls back en→ja→zh) |
| `fr-FR` | `/fr` | UI locale (masterdata falls back en→ja→zh) |
| `de-DE` | `/de` | UI locale (masterdata falls back en→ja→zh) |
| `ru-RU` | `/ru` | UI locale (masterdata falls back en→ja→zh) |

All locales listed in `SUPPORTED_LOCALES` are first-class: same keys, same routing, same SEO.

### Core vs non-core locales (Agent boundary)

**Core locales (always keep green with feature work - 5 languages):**
`zh-CN` (Simplified Chinese), `zh-TW` (Traditional Chinese), `ja-JP` (Japanese), `en-US` (English), `ko-KR` (Korean).

**Non-core locales** (`th-TH`, `id-ID`, `vi-VN`, `es-ES`, `pt-BR`, `fr-FR`, `de-DE`, `ru-RU`):

- `bun run lint:i18n` strictly enforces 1:1 key alignment for the 5 **core** locales.
- For **non-core** locales, missing keys only emit non-blocking CLI warnings, and runtime `t()` automatically falls back to `en-US`.
- **Do not** proactively edit, machine-translate, or touch non-core locale files during routine feature work.
- Only update non-core locale files when the user explicitly requests syncing them.

### When you add or change UI text

1. For **core** locales, add the key to the 5 core files: `zh-CN`, `zh-TW`, `ja-JP`, `en-US`, `ko-KR`.
2. Prefer drafting English first in `en-US.ts`, then mirror into the other 4 core locales.
3. Do **not** leave a new key missing from any of the 5 **core** languages (`bun run lint:i18n` will fail if a core locale is missing a key).
4. Do **not** touch non-core locale files unless user explicitly asks.
5. Do **not** hardcode CJK UI strings in `.astro` / `.tsx` / `.ts` components. Use `t(locale, "…")`.
6. Do **not** add `Record<AppLocale, …>` copy maps in components/libs. All user-facing strings go in `src/i18n/messages/*` and are read via `t()`.
7. Escape hatch only with an inline `// i18n-allow-hardcoded` (or JSX comment) on that line.
8. Settings language label should stay bilingual (`… / Language`) so users can always find the switcher.

### Runtime fallback (do not reverse this)

`t()` resolution order:

1. Current locale message
2. **`en-US`** (`FALLBACK_LOCALE`)
3. Empty string

Never fall back to the raw i18n key in user-facing UI. Missing copy should look blank or English — not `nav.items.foo`.

Masterdata text (game tables) uses `localizeMasterText` in `src/lib/masterdata/localize-text.ts`:

- `zh-CN` → simplified → traditional → ja → en → ko
- `zh-TW` → traditional → simplified → ja → en → ko
- `ja-JP` → ja → en → zh → ko
- `ko-KR` → ko → en → ja → zh
- `en-US` / `th-TH` / `id-ID` / `vi-VN` / `es-ES` / `pt-BR` / `fr-FR` / `de-DE` / `ru-RU` / future UI-only locales → en → ja → zh → ko

`MasterText` ships five fields: `japanese` / `english` / `simplifiedChinese` / `traditionalChinese` / `korean`. Blank cells and untranslated keys left in a cell (e.g. english `Music_Tilte_33`) count as missing and fall through to the next language. UI-only locales still work; content names show English until masterdata grows dedicated fields. Story script `Text` tables go through the same helper.

### Adding a new locale later

1. Extend `SUPPORTED_LOCALES` + path/label/HTML/OG maps in `src/config/locales.ts`.
2. Add `src/i18n/messages/<locale>.ts` with the same keys as `zh-CN`.
3. Register the locale in `astro.config.mjs` `i18n.locales`.
4. Wire the export into `src/i18n/index.ts` `messagesByLocale`.
5. Update `scripts/check-i18n-keys.mjs` export-name map.
6. Run `bun run lint` and `bun run check:search-seo`.

Keep locale lists derived from `SUPPORTED_LOCALES` wherever possible so Agent edits do not hardcode three-locale assumptions.

### What Agents should avoid

- Partial locale updates (only zh or only en).
- Exposing raw keys as fallback.
- Per-component locale maps (`const labels: Record<AppLocale, …>`). Centralize in message packs.
- Duplicating `localizeMasterText` with locale-specific if-chains — import the shared helper.
- Putting large content translations (full story scripts, asset dumps) into UI message files.
- Locale `if/else` trees for UI placeholders (comics/stamps names, etc.) — use message keys with `{id}` / `{name}` instead.

## Checks before finishing a task

```bash
bun run lint:i18n
bun run lint:i18n-routing
bun run lint:text
bun run check:search-seo
```

Full suite: `bun run lint`.

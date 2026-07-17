# Agent / contributor guide (MoeNotes)

## i18n workflow (read this first)

UI copy lives in `src/i18n/messages/*.ts`. Locale registry is `src/config/locales.ts`.

### Supported locales (in-repo)

| Locale | Path prefix | Role |
|--------|-------------|------|
| `zh-CN` | _(default, no prefix)_ | Product default / content authority for key inventory |
| `ja-JP` | `/ja` | Core |
| `en-US` | `/en` | Core **and runtime fallback** |
| `ko-KR` | `/ko` | Core (same key-alignment rules as the others) |

All locales listed in `SUPPORTED_LOCALES` are first-class: same keys, same routing, same SEO.

### When you add or change UI text

1. Add the key to **every** file under `src/i18n/messages/` (`zh-CN`, `ja-JP`, `en-US`, `ko-KR`).
2. Prefer writing English first in `en-US.ts`, then mirror keys into the other locale files.
3. Do **not** leave a new key only in one language. `bun run lint:i18n` requires 1:1 key alignment against `zh-CN`.
4. Do **not** hardcode CJK UI strings in `.astro` / `.tsx` / `.ts` components. Use `t(locale, "…")`.
5. Escape hatch only with an inline `// i18n-allow-hardcoded` (or JSX comment) on that line.

### Runtime fallback (do not reverse this)

`t()` resolution order:

1. Current locale message
2. **`en-US`** (`FALLBACK_LOCALE`)
3. Empty string

Never fall back to the raw i18n key in user-facing UI. Missing copy should look blank or English — not `nav.items.foo`.

Masterdata text (game tables) uses `localizeMasterText` in `src/lib/masterdata/localize-text.ts`:

- `zh-CN` → simplified/traditional Chinese → ja → en
- `ja-JP` → ja → en → zh
- `en-US` / `ko-KR` / future UI-only locales → en → ja → zh

Game master tables currently ship ja/en/zh fields only. Korean UI still works; content names may show English until masterdata grows a Korean field.

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
- Duplicating `localizeMasterText` with locale-specific if-chains — import the shared helper.
- Putting large content translations (full story scripts, asset dumps) into UI message files.

## Checks before finishing a task

```bash
bun run lint:i18n
bun run lint:i18n-routing
bun run lint:text
bun run check:search-seo
```

Full suite: `bun run lint`.

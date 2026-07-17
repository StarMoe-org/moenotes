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
| `ko-KR` | `/ko` | Core |
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

**Core locales (always keep green with feature work):** `zh-CN`, `ja-JP`, `en-US`.

**Non-core locales** (anything else under `src/i18n/messages/`, extra path prefixes, etc.):

- After ordinary feature / file changes, **finish the feature first** (logic, UI, routing, core three-locale copy).
- **Stop and wait for explicit user confirmation** before editing non-core i18n packs, wiring, or bulk-filling translations.
- **Do not** proactively open, rewrite, machine-translate, or “complete” non-core locale files unless the user asks.
- When the user does ask to sync non-core locales, keep UTF-8 intact, 1:1 keys vs `zh-CN`, and preserve placeholders / HTML.

### When you add or change UI text

1. For **core** locales, add the key to `zh-CN` / `ja-JP` / `en-US` (and any other locale currently in `SUPPORTED_LOCALES` **only if** the user already approved non-core work this task).
2. Prefer writing English first in `en-US.ts`, then mirror into `zh-CN` / `ja-JP`.
3. Do **not** leave a new key only in one **core** language. `bun run lint:i18n` requires 1:1 key alignment against `zh-CN` for every registered locale.
4. Do **not** hardcode CJK UI strings in `.astro` / `.tsx` / `.ts` components. Use `t(locale, "…")`.
5. Do **not** add `Record<AppLocale, …>` copy maps in components/libs. All user-facing strings go in `src/i18n/messages/*` and are read via `t()`.
6. Escape hatch only with an inline `// i18n-allow-hardcoded` (or JSX comment) on that line.
7. For non-core locales (when user-approved) it is OK to ship English temporarily **only if** keys still exist and SEO titles/descriptions meet length checks; prefer real translations for nav/shell/seo.
8. Settings language label should stay bilingual (`… / Language`) so users can always find the switcher.

### Runtime fallback (do not reverse this)

`t()` resolution order:

1. Current locale message
2. **`en-US`** (`FALLBACK_LOCALE`)
3. Empty string

Never fall back to the raw i18n key in user-facing UI. Missing copy should look blank or English — not `nav.items.foo`.

Masterdata text (game tables) uses `localizeMasterText` in `src/lib/masterdata/localize-text.ts`:

- `zh-CN` → simplified → traditional → ja → en
- `zh-TW` → traditional → simplified → ja → en
- `ja-JP` → ja → en → zh
- `en-US` / `ko-KR` / `th-TH` / `id-ID` / `vi-VN` / `es-ES` / `pt-BR` / `fr-FR` / `de-DE` / `ru-RU` / future UI-only locales → en → ja → zh

Game master tables currently ship ja/en/zh fields only. UI-only locales still work; content names may show English until masterdata grows dedicated fields.

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

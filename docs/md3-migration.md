# MD3 migration (Material 3 rewrite)

Status: foundation landed; shell migration next. This doc is the working plan
for the multi-phase UI rewrite from the legacy Sirius look (`--mn-*` tokens)
to Material 3. Decision log lives at the bottom.

## What exists (phase 1: foundation)

- `src/vendor/material-color-utilities/`: single-file esbuild bundle of the
  official `@material/material-color-utilities@0.4.0` color-scheme subset
  (`SchemeTonalSpot`, `SchemeVibrant`, `Hct`, hex utils) + minimal `.d.mts` /
  `.d.ts` + `SOURCE.json` provenance. No new npm dependency, so
  `bun install --frozen-lockfile` keeps working.
- `src/lib/md3/scheme.ts`: seed hex -> full M3 sys-color scheme (light/dark),
  CSS variable names (`--md-sys-color-*`), document application.
- `src/lib/settings/accent.ts` + `src/lib/settings/apply-theme.ts`: the band
  accent pipeline now carries `md3` schemes in the same localStorage cache;
  the head bootstrap applies `--md-sys-color-*` before first paint. Old cache
  entries without `md3` are tolerated (one hydration upgrades them).
- `src/styles/md3/tokens.css`: default light/dark schemes (seed `#395EA8`,
  tonal-spot) + shape / type / elevation / state / motion sys tokens.
- `src/styles/md3/components.css`: batch-1 component styles (buttons, icon
  buttons, FAB, chips, cards, divider, badge, nav bar / drawer / rail, top
  app bar, tabs, switch, checkbox, radio, list, menu, text field, search bar,
  snackbar, progress, dialog, segmented buttons, ripple, surface helpers).
- `src/lib/md3/classes.ts`: class builders shared by Astro and React.
- `src/lib/md3/ripple.ts`: framework-free ripple spawner.
- `src/components/md3/`: React primitives for every batch-1 component.

## What exists (phase 1b: MUI library integration)

Hand-rolled primitives cannot cover Select / Autocomplete / Slider /
DatePicker-class interactions, so interactive React islands use MUI
(`@mui/material` + Emotion) instead of extending the hand-rolled set:

- `src/lib/md3/mui-palette.ts`: one M3 scheme -> one MUI palette per color
  scheme. Only `main` + `contrastText` are set explicitly (canonical M3);
  `light` / `dark` derive via MUI's tonal offset. Warning / info / success
  ramps come from fixed seeds through the same tonal-spot math.
- `src/lib/md3/mui-theme.ts`: `buildMd3MuiTheme({light, dark})` with
  `cssVariables` + both `colorSchemes`. The `data-theme` attribute (owned by
  the settings pipeline) switches schemes in pure CSS; the theme object
  rebuilds only on seed changes. Container / surface roles are read from
  `var(--md-sys-color-*)`, not duplicated into the MUI palette.
- `src/components/md3/MuiProvider.tsx`: emotion `CacheProvider` (prepend, so
  app styles win ties) + MUI `ThemeProvider`, subscribed to the settings
  store. No `CssBaseline` (its body background would restyle legacy pages)
  and no MUI `useColorScheme` (the settings pipeline owns `data-theme`).
- `src/types/mui.d.ts`: module augmentation for the `tertiary` palette
  color on Button / IconButton / Chip / Fab / Badge / progress / Switch.

## Conventions

- New MD3 UI uses `--md-sys-*` tokens and `.md3-*` classes only. Legacy
  `--mn-*` tokens stay until their surface migrates; the two systems coexist
  during the migration (no big-bang restyle).
- React islands use MUI components under `MdMuiProvider` (MUI-first). Astro
  static markup (MUI is React-only) uses `.md3-*` class strings, via the
  `classes.ts` builders where variants matter. The hand-rolled
  `src/components/md3/` wrappers stay for Astro-friendly/simple cases but
  new interactive work goes to MUI.
- Color roles come from `MD3_COLOR_ROLES` in `scheme.ts`. Adding a role:
  extend the list, regenerate the default values below, rebuild nothing else
  (the bootstrap applies whatever the cache carries).
- Do not hand-tune per-seed colors. Contrast is guaranteed by
  material-color-utilities; band hues flow through unchanged.
- Emotion SSR: islands render without `<style>` tags on the server and
  hydrate styles on the client. Shell islands are `client:load`, so the
  unstyled flash is minimal; do not put MUI components in long
  `client:visible`/`client:idle` below-the-fold islands without checking.

## Regenerating the default scheme

Prerequisite: the vendored bundle (rebuild: see
`src/vendor/material-color-utilities/SOURCE.json` for the exact command).

```bash
node --input-type=module -e "
import { SchemeTonalSpot, Hct, hexFromArgb, argbFromHex } from './src/vendor/material-color-utilities/mcu-scheme.mjs';
import { readFileSync } from 'node:fs';
const roles = [...readFileSync('./src/lib/md3/scheme.ts', 'utf8').matchAll(/^\s*\"([a-zA-Z]+)\",\$/gm)].map((m) => m[1]);
const kebab = (r) => r.replace(/([A-Z])/g, (m) => '-' + m.toLowerCase());
for (const dark of [false, true]) {
  console.log(dark ? '/* dark */' : '/* light */');
  const s = new SchemeTonalSpot(Hct.fromInt(argbFromHex('#395EA8')), dark, 0.0);
  for (const r of roles) console.log('  --md-sys-color-' + kebab(r) + ': ' + hexFromArgb(s[r]) + ';');
}
"
```

Paste the output into `src/styles/md3/tokens.css`.

## Phases

1. Foundation (done): tokens, scheme pipeline, batch-1 components.
1b. MUI integration (done): deps, theme, provider, augmentation.
2. Shell (next, MUI): `Header.astro` -> AppBar + Search + menus,
   `Sidebar.tsx` -> Drawer (desktop) / BottomNavigation (mobile),
   `Footer.astro`, `SettingsDrawer.tsx`, `CommandPalette.tsx`,
   scroll-to-top -> FAB.
3. Shared explorer primitives (MUI): filters (Select/Autocomplete/Chips),
   sort controls, entity pagers, data tables, section headings.
   Date-range filters need `@mui/x-date-pickers` (add when phase 3 starts).
4. Route pages, domain by domain (cards, characters, music, events, ...).
5. Cleanup: retire `--mn-*` tokens, enable `CssBaseline`, update
   `VISUAL_DESIGN.md`, extend the design-system page
   (`/tools/design-system`) with MD3 samples.

## Decision log

- 2026-10-07: scheme variant is tonal-spot for all seeds (M3 default);
  vibrant is bundled but unused, reserved for vivid band seeds if the muted
  tonal-spot ramps feel off-brand. One-line change in `accent.ts`.
- 2026-10-07: default seed `#395EA8` (legacy `--mn-accent-deep`) for brand
  hue continuity; exact values follow M3 tonal mathematics, not the legacy
  ramps.
- 2026-10-07: vendor (bundle) instead of npm dependency: CI pins
  `bun --frozen-lockfile` and the sandbox has no bun to regenerate it; the
  published package's extensionless imports also break unbundled ESM.
- 2026-10-07: hand-rolled Tailwind/CSS primitives first (zero new runtime
  deps), then superseded for interactive islands (see next entry). The CSS
  stays for Astro static markup.
- 2026-10-07: interactive React islands use @mui/material v9 (Emotion
  runtime, cssVariables + colorSchemes) instead of extending the hand-rolled
  set: Select / Autocomplete / Slider / menus / dialogs match M3 with full
  keyboard and screen-reader behavior. material-web (web components) was
  rejected for poor React integration; Pigment CSS (zero-runtime) was
  rejected for build complexity. Custom `data-theme` selector keeps the
  settings pipeline as the single color-scheme owner.
- 2026-10-07: sandbox has no bun, but the `bun` npm distribution ships the
  binary as registry tarballs (`@oven/bun-linux-x64`), so `bun add` ran
  from /tmp with real lockfile updates (lockfileVersion stays 1 for CI's
  bun 1.3.14). Sandbox TLS flakes required `--network-concurrency=4` plus
  cache warming; CI runners are unaffected.

/**
 * Material 3 color schemes from one seed color.
 *
 * The scheme math comes from the vendored material-color-utilities subset
 * (src/vendor/material-color-utilities/); this module owns the app's shape of
 * it: typed roles, CSS variable names, document application and the cache
 * entries the head bootstrap script consumes.
 */

import {
  Hct,
  SchemeTonalSpot,
  SchemeVibrant,
  argbFromHex,
  hexFromArgb,
} from "@/vendor/material-color-utilities/mcu-scheme.mjs";

/** Scheme construction flavor. Tonal spot is the M3 default; vibrant is reserved for vivid band seeds. */
export type Md3SchemeVariant = "tonal-spot" | "vibrant";

/** Seed of the default (non-band) theme: the legacy brand accent-deep, so the default M3 scheme keeps the brand hue. */
export const DEFAULT_MD3_SEED = "#395EA8";
export const DEFAULT_MD3_VARIANT: Md3SchemeVariant = "tonal-spot";

/** Normal contrast (M3 contrast levels run -1 .. 1). */
const CONTRAST_LEVEL = 0;

/** All M3 sys-color roles, camelCase as the scheme class exposes them. */
export const MD3_COLOR_ROLES = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "primaryFixed",
  "primaryFixedDim",
  "onPrimaryFixed",
  "onPrimaryFixedVariant",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "secondaryFixed",
  "secondaryFixedDim",
  "onSecondaryFixed",
  "onSecondaryFixedVariant",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "tertiaryFixed",
  "tertiaryFixedDim",
  "onTertiaryFixed",
  "onTertiaryFixedVariant",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "background",
  "onBackground",
  "surface",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "surfaceTint",
  "inverseSurface",
  "inverseOnSurface",
  "inversePrimary",
  "outline",
  "outlineVariant",
  "scrim",
  "shadow",
] as const;

export type Md3ColorRole = (typeof MD3_COLOR_ROLES)[number];

/** One theme's scheme: every role as lowercase `#rrggbb`. */
export type Md3ColorScheme = Record<Md3ColorRole, string>;

export interface Md3ColorSchemes {
  color: string;
  variant: Md3SchemeVariant;
  light: Md3ColorScheme;
  dark: Md3ColorScheme;
}

function normalizeSeed(hex: string): string | null {
  const value = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const short = /^#?([0-9a-f]{3})$/i.exec(value);
  if (short?.[1]) return `#${[...short[1].toLowerCase()].map((c) => c + c).join("")}`;
  const long = /^#?([0-9a-f]{6})$/i.exec(value);
  return long?.[1] ? `#${long[1].toLowerCase()}` : null;
}

/** One theme's M3 scheme for a seed color, or null when the seed is not a color. */
export function md3ColorScheme(
  seedHex: string,
  dark: boolean,
  variant: Md3SchemeVariant = DEFAULT_MD3_VARIANT,
): Md3ColorScheme | null {
  const seed = normalizeSeed(seedHex);
  if (!seed) return null;
  const SchemeCtor = variant === "vibrant" ? SchemeVibrant : SchemeTonalSpot;
  const scheme = new SchemeCtor(Hct.fromInt(argbFromHex(seed)), dark, CONTRAST_LEVEL);
  const out = {} as Md3ColorScheme;
  for (const role of MD3_COLOR_ROLES) out[role] = hexFromArgb(scheme[role]);
  return out;
}

/** Both themes' schemes for a seed color, in the form the settings cache stores. */
export function md3ColorSchemes(
  seedHex: string,
  variant: Md3SchemeVariant = DEFAULT_MD3_VARIANT,
): Md3ColorSchemes | null {
  const light = md3ColorScheme(seedHex, false, variant);
  const dark = md3ColorScheme(seedHex, true, variant);
  if (!light || !dark) return null;
  return { color: seedHex, light, dark, variant };
}

/** `primaryContainer` -> `--md-sys-color-primary-container`. */
export function md3RoleToCssVar(role: Md3ColorRole): string {
  return `--md-sys-color-${role.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)}`;
}

/** Applies a scheme's variables to the document root, or removes the overrides (the stylesheet's default scheme). */
export function applyMd3SchemeToDocument(root: HTMLElement, scheme: Md3ColorScheme | null): void {
  for (const role of MD3_COLOR_ROLES) {
    const variable = md3RoleToCssVar(role);
    if (scheme) root.style.setProperty(variable, scheme[role]);
    else root.style.removeProperty(variable);
  }
  if (scheme) root.dataset.md3 = "band";
  else delete root.dataset.md3;
}

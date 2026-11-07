/**
 * Material 3 schemes from one seed color (the default brand blue, a band's MasterBand.mainColorCode, or a character's
 * MasterCharacter.mainColorCode chosen in the settings), on the recipe MoeSekai uses: a neutral stage and the seed's
 * own color for accents.
 *
 * - Page, cards and outlines are a set of cool neutral greys that do not depend on the seed (NEUTRAL_SURFACES):
 *   surfaces derived from the seed lay a cast over the whole page, and pale seeds turn it grey and dull.
 * - The seed only shows where something is emphasized, and keeps its own color as far as it can:
 *   primary-container is the seed itself (selection, badges) with near-black or white on it; primary and secondary
 *   are the seed's palette at the tone that reads as text on a card (4.5:1); secondary-container is the seed as a
 *   soft tint over the card (navigation's current page, tonal buttons).
 * - Tertiary is the tonal-spot hue rotation of the seed with enough chroma to read as a color, used the same three
 *   ways. Error, warning and success keep fixed hues, so a warning never turns cyan for one band and lilac for
 *   another; the category hues for tags and charts are harmonized toward the seed.
 *
 * The result is cached in browser storage (src/lib/settings/apply-theme.ts) so the head bootstrap script applies it
 * before the first paint; the default seed's schemes are baked into src/styles/md3/colors.css by
 * scripts/generate-md3-tokens.ts.
 */
import { Blend, DynamicScheme, Hct, SchemeTonalSpot, TonalPalette, Variant, argbFromHex, hexFromArgb } from "@material/material-color-utilities";
import { MD3_BASE_ROLES, MD3_CATEGORY_GROUPS, contrastRatio, type Md3CategoryGroup, type Md3Colors, type Md3Schemes } from "@/lib/md3/roles";

/** The MoeNotes blue, light enough that its fill carries dark text, as MoeSekai's teal does. */
export const MD3_DEFAULT_SEED = "#4C9DF0";

/** Source hues of the category groups (tags and charts), harmonized toward the seed. */
export const MD3_CATEGORY_SOURCES: Record<Md3CategoryGroup, string> = {
  category1: "#D3487A", // rose / pink
  category2: "#00A3B4", // cyan
  category3: "#E5A50A", // amber
  category4: "#4E9A4A", // mint / moss
  category5: "#7A5AC8", // violet
};

/** Status hues that do not follow the seed. */
const STATUS_SOURCES = { warning: { hex: "#E6A100", chroma: 60 }, success: { hex: "#2E9E5B", chroma: 48 } } as const;

type Mode = "light" | "dark";

/** Seed-independent surfaces: cool neutral greys, one set per mode. `surfaceCard` is where cards and panels sit. */
const NEUTRAL_SURFACES: Record<Mode, Md3Colors> = {
  light: {
    surface: "#f4f5f6", surfaceDim: "#d9dbde", surfaceBright: "#f8f9f9", background: "#f4f5f6",
    surfaceContainerLowest: "#ffffff", surfaceContainerLow: "#f8f9f9", surfaceContainer: "#eff0f1",
    surfaceContainerHigh: "#e9eaec", surfaceContainerHighest: "#e2e4e6", surfaceCard: "#ffffff",
    onSurface: "#17181a", onBackground: "#17181a", surfaceVariant: "#e2e4e6", onSurfaceVariant: "#5a5e64",
    outline: "#8a8e94", outlineVariant: "#dddfe2", inverseSurface: "#2c2d30", inverseOnSurface: "#eff0f1",
  },
  dark: {
    surface: "#121314", surfaceDim: "#121314", surfaceBright: "#37393c", background: "#121314",
    // Lowest only just under the card: pages use it for the white boxes of light mode, which a near-black well
    // would turn into holes.
    surfaceContainerLowest: "#151618", surfaceContainerLow: "#1a1b1d", surfaceContainer: "#1f2023",
    surfaceContainerHigh: "#27292b", surfaceContainerHighest: "#303235", surfaceCard: "#1a1b1d",
    onSurface: "#eceef0", onBackground: "#eceef0", surfaceVariant: "#303235", onSurfaceVariant: "#a5a8ad",
    outline: "#6c7076", outlineVariant: "#2e3033", inverseSurface: "#e4e6e9", inverseOnSurface: "#2c2d30",
  },
};

const MIN_TEXT_CONTRAST = 4.5;
/** A solid fill must still read as a shape against the card. */
const MIN_FILL_CONTRAST: Record<Mode, number> = { light: 1.3, dark: 3 };
/** How much of the seed the soft tint carries over the card. */
const TINT_AMOUNT: Record<Mode, number> = { light: 0.14, dark: 0.22 };
const INK = { dark: "#17181a", light: "#ffffff" } as const;

// Category groups follow M3 custom-color tones: color / on / container / on-container.
const LIGHT_TONES = [40, 100, 90, 10] as const;
const DARK_TONES = [80, 20, 30, 90] as const;
// A floor so harmonized hues stay recognizably colored even when the source is muted.
const CATEGORY_MIN_CHROMA = 40;

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Near-black or white, whichever reads over `fill`; null when neither reaches body-text contrast. */
function inkOn(fill: string): string | null {
  const best = contrastRatio(fill, INK.dark) >= contrastRatio(fill, INK.light) ? INK.dark : INK.light;
  return contrastRatio(fill, best) >= MIN_TEXT_CONTRAST ? best : null;
}

/** The seed itself when it passes `ok`, else the closest tone of its own palette that does. */
function nearestTone(palette: TonalPalette, seed: string, ok: (color: string) => boolean): string {
  if (ok(seed)) return seed;
  const start = Math.round(Hct.fromInt(argbFromHex(seed)).tone);
  for (let step = 1; step <= 100; step++) {
    for (const tone of [start - step, start + step]) {
      if (tone < 0 || tone > 100) continue;
      const color = hexFromArgb(palette.tone(tone));
      if (ok(color)) return color;
    }
  }
  throw new Error(`no usable tone for ${seed}`);
}

/** `amount` of `fg` laid over `bg`. */
function mix(fg: string, bg: string, amount: number): string {
  const a = argbFromHex(fg);
  const b = argbFromHex(bg);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * amount + ((b >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

interface Shades {
  text: string;
  onText: string;
  fill: string;
  onFill: string;
  tint: string;
  onTint: string;
}

/** One accent resolved against the neutral surfaces: legible text, a solid fill and a soft tint. */
function accentShades(palette: TonalPalette, seed: string, mode: Mode): Shades {
  const surfaces = NEUTRAL_SURFACES[mode];
  const card = surfaces.surfaceCard!;
  // Accent text and icons stay legible on every container they sit on.
  const textBg = mode === "dark" ? surfaces.surfaceContainerHigh! : surfaces.surface!;
  const text = nearestTone(palette, seed, (c) => contrastRatio(c, textBg) >= MIN_TEXT_CONTRAST);
  const fill = nearestTone(palette, seed, (c) => inkOn(c) !== null && contrastRatio(c, card) >= MIN_FILL_CONTRAST[mode]);
  const tint = mix(fill, card, TINT_AMOUNT[mode]);
  const onTint = nearestTone(palette, seed, (c) => contrastRatio(c, tint) >= 7);
  return { text, onText: inkOn(text)!, fill, onFill: inkOn(fill)!, tint, onTint };
}

/** A status color: legible text and solid, and a soft tint for its container rather than a saturated block. */
function statusRoles(name: string, palette: TonalPalette, mode: Mode): Md3Colors {
  const shades = accentShades(palette, hexFromArgb(palette.tone(mode === "dark" ? 70 : 40)), mode);
  const cap = capitalize(name);
  return { [name]: shades.text, [`on${cap}`]: shades.onText, [`${name}Container`]: shades.tint, [`on${cap}Container`]: shades.onTint };
}

function categoryRoles(group: Md3CategoryGroup, seedArgb: number, mode: Mode): Md3Colors {
  const harmonized = Hct.fromInt(Blend.harmonize(argbFromHex(MD3_CATEGORY_SOURCES[group]), seedArgb));
  const palette = TonalPalette.fromHueAndChroma(harmonized.hue, Math.max(harmonized.chroma, CATEGORY_MIN_CHROMA));
  const tones = mode === "dark" ? DARK_TONES : LIGHT_TONES;
  const cap = capitalize(group);
  return {
    [group]: hexFromArgb(palette.tone(tones[0])),
    [`on${cap}`]: hexFromArgb(palette.tone(tones[1])),
    [`${group}Container`]: hexFromArgb(palette.tone(tones[2])),
    [`on${cap}Container`]: hexFromArgb(palette.tone(tones[3])),
  };
}

/**
 * Highlighter ink under heading text (`.mn-brand-mark`): as much of the seed as on-surface text over it allows, laid
 * over the page. Pale seeds keep their exact color in light mode; dark seeds are thinned until the text reads. Dark
 * mode starts at 55%, because a full-strength pastel would swallow light text.
 */
function brandMark(seed: string, mode: Mode): string {
  const { surface, onSurface } = NEUTRAL_SURFACES[mode];
  for (let percent = mode === "dark" ? 55 : 100; percent > 0; percent -= 5) {
    const ink = mix(seed, surface!, percent / 100);
    if (contrastRatio(ink, onSurface!) >= MIN_TEXT_CONTRAST) return ink;
  }
  return surface!;
}

/** One theme (light or dark) for `seed` (`#RRGGBB`). */
export function md3Colors(seed: string, dark: boolean): Md3Colors {
  const mode: Mode = dark ? "dark" : "light";
  const seedHex = seed.toLowerCase();
  const seedArgb = argbFromHex(seedHex);
  const source = Hct.fromInt(seedArgb);
  const tonalSpot = new SchemeTonalSpot(source, dark, 0);
  // The seed's own palette (fixed roles, inverse primary), not tonal spot's muted one.
  const primaryPalette = TonalPalette.fromHueAndChroma(source.hue, Math.max(source.chroma, 48));
  const scheme = new DynamicScheme({
    sourceColorHct: source,
    variant: Variant.TONAL_SPOT,
    contrastLevel: 0,
    isDark: dark,
    primaryPalette,
    secondaryPalette: tonalSpot.secondaryPalette,
    tertiaryPalette: tonalSpot.tertiaryPalette,
    neutralPalette: TonalPalette.fromHueAndChroma(source.hue, 4),
    neutralVariantPalette: TonalPalette.fromHueAndChroma(source.hue, 8),
  });
  const colors: Md3Colors = {};
  for (const role of MD3_BASE_ROLES) colors[role] = hexFromArgb(scheme[role]);
  Object.assign(colors, NEUTRAL_SURFACES[mode]);

  const p = accentShades(primaryPalette, seedHex, mode);
  const tertiaryPalette = TonalPalette.fromHueAndChroma(tonalSpot.tertiaryPalette.hue, Math.min(64, Math.max(40, source.chroma)));
  const t = accentShades(tertiaryPalette, hexFromArgb(tertiaryPalette.tone(source.tone)), mode);
  Object.assign(colors, {
    primary: p.text, onPrimary: p.onText, primaryContainer: p.fill, onPrimaryContainer: p.onFill,
    secondary: p.text, onSecondary: p.onText, secondaryContainer: p.tint, onSecondaryContainer: p.onTint,
    surfaceTint: p.text,
    tertiary: t.text, onTertiary: t.onText, tertiaryContainer: t.tint, onTertiaryContainer: t.onTint,
    brandMark: brandMark(seedHex, mode),
  });
  // Error keeps M3's red; its container is a tint like the other status colors.
  Object.assign(colors, statusRoles("error", scheme.errorPalette, mode));
  for (const [name, { hex, chroma }] of Object.entries(STATUS_SOURCES)) {
    Object.assign(colors, statusRoles(name, TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex(hex)).hue, chroma), mode));
  }
  for (const group of MD3_CATEGORY_GROUPS) Object.assign(colors, categoryRoles(group, seedArgb, mode));
  return colors;
}

/** Light and dark schemes for `seed`, or null when it is not a `#RRGGBB` color. */
export function md3Schemes(seed: string): Md3Schemes | null {
  if (!isHexColor(seed)) return null;
  return { light: md3Colors(seed, false), dark: md3Colors(seed, true) };
}

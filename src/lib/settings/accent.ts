/**
 * Theme accent palettes from one color (a band's MasterBand.mainColorCode): the `--mn-accent` family of
 * src/styles/tokens.css (light) and themes.css (dark), with the contrast the default palette keeps.
 *
 * The palettes of the chosen color are cached in browser storage when the settings are applied, so the head's bootstrap
 * script (src/lib/settings/apply-theme.ts) sets them before the first paint without computing anything.
 */

export interface AccentPalette {
  accent: string;
  deep: string;
  soft: string;
}

type Rgb = readonly [number, number, number];

// The page paper of each theme (tokens.css / themes.css --mn-paper).
const PAPER_LIGHT: Rgb = [247, 250, 255];
const PAPER_DARK: Rgb = [16, 27, 49];

export function parseHexColor(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1]!;
  if (value.length === 3) value = [...value].map((c) => c + c).join("");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round) as unknown as Rgb;
}

/** `from` moved toward black (light theme) / white (dark theme) until its contrast with the paper reaches `ratio`. */
function reach(from: Rgb, paper: Rgb, toward: Rgb, ratio: number): Rgb {
  for (let step = 0; step <= 40; step += 1) {
    const color = mix(from, toward, step / 40);
    if (contrast(color, paper) >= ratio) return color;
  }
  return toward;
}

/**
 * Light or dark palette for `hex` (`#RGB` / `#RRGGBB`), or null when it is not a color:
 * - `deep` carries text and filled buttons (paper-colored text on it), so it reaches 4.5:1 against the paper;
 * - `accent` (borders, rings, focus) keeps the band's hue at 3:1 against the paper;
 * - `soft` is a pale (light) / deep (dark) tint for selected backgrounds, `deep` staying readable on it.
 */
export function accentPalette(hex: string, dark: boolean): AccentPalette | null {
  const base = parseHexColor(hex);
  if (!base) return null;
  const paper = dark ? PAPER_DARK : PAPER_LIGHT;
  const toward: Rgb = dark ? [255, 255, 255] : [0, 0, 0];
  const accent = reach(base, paper, toward, 3);
  const deep = reach(mix(base, toward, dark ? 0.2 : 0.12), paper, toward, 5);
  let soft = mix(paper, base, dark ? 0.24 : 0.14);
  // Keep the selected state readable: deep text on the soft tint at 4.5:1 or more.
  for (let step = 0; step < 10 && contrast(deep, soft) < 4.5; step += 1) soft = mix(soft, paper, 0.3);
  return { accent: toHex(accent), deep: toHex(deep), soft: toHex(soft) };
}

/** WCAG contrast of two `#RRGGBB` colors. */
export function contrastRatio(a: string, b: string): number {
  const x = parseHexColor(a);
  const y = parseHexColor(b);
  return x && y ? contrast(x, y) : 1;
}

/** Both palettes of a color, in the form the bootstrap script caches. */
export interface AccentPalettes {
  color: string;
  light: AccentPalette;
  dark: AccentPalette;
}

export function accentPalettes(hex: string): AccentPalettes | null {
  const light = accentPalette(hex, false);
  const dark = accentPalette(hex, true);
  return light && dark ? { color: hex, light, dark } : null;
}

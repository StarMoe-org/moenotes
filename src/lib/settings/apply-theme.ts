import { ACCENT_PALETTE_STORAGE_KEY, DEFAULT_ACCENT, SETTINGS_STORAGE_KEY } from "@/config/settings";
import { HOME_LAYOUT_STORAGE_KEY, HOME_LAYOUT_STYLE_ID, HOME_MODULES } from "@/lib/home/layout";
import { applyMd3SchemeToDocument } from "@/lib/md3/scheme";
import { accentPalettes, type AccentPalette, type AccentPalettes } from "@/lib/settings/accent";
import type { AppSettings, ColorScheme } from "@/types/settings";

export function resolveColorScheme(colorScheme: ColorScheme): "light" | "dark" {
  if (colorScheme === "light" || colorScheme === "dark") return colorScheme;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

const ACCENT_VARIABLES: ReadonlyArray<readonly [keyof AccentPalette, string]> = [["accent", "--mn-accent"], ["deep", "--mn-accent-deep"], ["soft", "--mn-accent-soft"]];

/** Overrides the accent variables with a band palette, or removes the overrides (the stylesheet's default palette). */
function applyAccent(root: HTMLElement, palette: AccentPalette | null): void {
  for (const [key, variable] of ACCENT_VARIABLES) {
    if (palette) root.style.setProperty(variable, palette[key]);
    else root.style.removeProperty(variable);
  }
  if (palette) root.dataset.accent = "band";
  else delete root.dataset.accent;
}

/** Keeps the bootstrap script's palette cache in step with the setting (direct storage: this file is allowed to). */
function cachePalettes(palettes: AccentPalettes | null): void {
  try {
    if (palettes) window.localStorage.setItem(ACCENT_PALETTE_STORAGE_KEY, JSON.stringify(palettes));
    else window.localStorage.removeItem(ACCENT_PALETTE_STORAGE_KEY);
  } catch {
    // storage unavailable: the next page load starts with the default accent until hydration
  }
}

export function applySettingsToDocument(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const resolved = resolveColorScheme(settings.colorScheme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = settings.colorScheme;
  root.style.colorScheme = resolved;
  root.dataset.density = settings.density;
  const palettes = settings.accentColor === DEFAULT_ACCENT ? null : accentPalettes(settings.accentColor);
  applyAccent(root, palettes ? palettes[resolved] : null);
  applyMd3SchemeToDocument(root, palettes ? palettes.md3[resolved] : null);
  cachePalettes(palettes);
}

/**
 * Runs in the head before anything paints: theme, density, the accent palette (cached by applySettingsToDocument)
 * and the home layout (src/lib/home/layout.ts), so a reload never flashes the defaults.
 */
export function buildThemeBootstrapScript(): string {
  return `
(function(){
  var root = document.documentElement;
  var colorScheme = 'system';
  var settings = {};
  try {
    var raw = localStorage.getItem(${JSON.stringify(SETTINGS_STORAGE_KEY)});
    settings = (raw ? JSON.parse(raw) : {}) || {};
    if (['system','light','dark'].indexOf(settings.colorScheme) >= 0) {
      colorScheme = settings.colorScheme;
    }
  } catch(e) {}
  var resolved = colorScheme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : colorScheme;
  root.dataset.theme = resolved;
  root.dataset.themePreference = colorScheme;
  root.style.colorScheme = resolved;
  root.dataset.density = settings.density === 'compact' ? 'compact' : 'comfortable';
  try {
    var accent = typeof settings.accentColor === 'string' ? settings.accentColor.toUpperCase() : '';
    var cached = JSON.parse(localStorage.getItem(${JSON.stringify(ACCENT_PALETTE_STORAGE_KEY)}) || 'null');
    var palette = cached && accent && String(cached.color).toUpperCase() === accent ? cached[resolved] : null;
    if (palette && palette.accent && palette.deep && palette.soft) {
      root.style.setProperty('--mn-accent', palette.accent);
      root.style.setProperty('--mn-accent-deep', palette.deep);
      root.style.setProperty('--mn-accent-soft', palette.soft);
      root.dataset.accent = 'band';
    }
    var md3 = cached && accent && String(cached.color).toUpperCase() === accent && cached.md3 ? cached.md3[resolved] : null;
    if (md3 && typeof md3 === 'object') {
      for (var role in md3) {
        if (!Object.prototype.hasOwnProperty.call(md3, role)) continue;
        var hex = md3[role];
        if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) continue;
        var kebab = role.replace(/([A-Z])/g, function(m){ return '-' + m.toLowerCase(); });
        if (!/^[a-z][a-z0-9-]*$/.test(kebab)) continue;
        root.style.setProperty('--md-sys-color-' + kebab, hex);
      }
      root.dataset.md3 = 'band';
    }
  } catch(e) {}
  try {
    var layout = JSON.parse(localStorage.getItem(${JSON.stringify(HOME_LAYOUT_STORAGE_KEY)}) || 'null');
    if (layout && layout.order && layout.order.length) {
      var known = ${JSON.stringify(HOME_MODULES)};
      var order = [];
      for (var i = 0; i < layout.order.length; i++) if (known.indexOf(layout.order[i]) >= 0 && order.indexOf(layout.order[i]) < 0) order.push(layout.order[i]);
      for (var j = 0; j < known.length; j++) {
        if (order.indexOf(known[j]) >= 0) continue;
        var at = 0;
        for (var q = j - 1; q >= 0; q--) { var found = order.indexOf(known[q]); if (found >= 0) { at = found + 1; break; } }
        order.splice(at, 0, known[j]);
      }
      var hidden = layout.hidden || [];
      var css = '';
      for (var k = 0; k < order.length; k++) css += '[data-home-module="' + order[k] + '"]{order:' + k + (hidden.indexOf(order[k]) >= 0 ? ';display:none!important' : '') + '}';
      var style = document.createElement('style');
      style.id = ${JSON.stringify(HOME_LAYOUT_STYLE_ID)};
      style.textContent = css;
      document.head.appendChild(style);
    }
  } catch(e) {}
})();`;
}

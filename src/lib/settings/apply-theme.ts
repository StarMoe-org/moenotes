import { ACCENT_PALETTE_STORAGE_KEY, DEFAULT_ACCENT, SETTINGS_STORAGE_KEY } from "@/config/settings";
import { storageKeys } from "@/config/storage";
import { HOME_LAYOUT_STORAGE_KEY, HOME_LAYOUT_STYLE_ID, HOME_MODULES } from "@/lib/home/layout";
import { colorDeclarations, MD3_ROLES, roleChannelVariable, roleCssVariable, type Md3Colors } from "@/lib/md3/roles";
import { ACCENT_CACHE_VERSION, accentCache, type AccentCache } from "@/lib/settings/accent";
import { NAV_GROUP_CHEVRON_ATTRIBUTE, NAV_GROUP_LIST_PREFIX, NAV_GROUPS_STYLE_ID } from "@/lib/sidebar/nav-groups";
import type { AppSettings, ColorScheme } from "@/types/settings";

export function resolveColorScheme(colorScheme: ColorScheme): "light" | "dark" {
  if (colorScheme === "light" || colorScheme === "dark") return colorScheme;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/** Sets a band's Material 3 colors on <html>, or removes them (the stylesheet's default scheme, src/styles/md3/colors.css). */
function applyScheme(root: HTMLElement, colors: Md3Colors | null): void {
  for (const role of MD3_ROLES) {
    root.style.removeProperty(roleCssVariable(role));
    root.style.removeProperty(roleChannelVariable(role));
  }
  if (colors) {
    for (const [name, value] of colorDeclarations(colors)) root.style.setProperty(name, value);
    root.dataset.accent = "band";
  } else {
    delete root.dataset.accent;
  }
}

/** Keeps the bootstrap script's scheme cache in step with the setting (direct storage: this file is allowed to). */
function cacheSchemes(cache: AccentCache | null): void {
  try {
    if (cache) window.localStorage.setItem(ACCENT_PALETTE_STORAGE_KEY, JSON.stringify(cache));
    else window.localStorage.removeItem(ACCENT_PALETTE_STORAGE_KEY);
  } catch {
    // storage unavailable: the next page load starts with the default scheme until hydration
  }
}

let appliedAccent: { color: string; cache: AccentCache | null } | null = null;

export function applySettingsToDocument(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const resolved = resolveColorScheme(settings.colorScheme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = settings.colorScheme;
  root.style.colorScheme = resolved;
  root.dataset.density = settings.density;
  // Generating schemes takes a few milliseconds; settings change far more often than the accent.
  if (appliedAccent?.color !== settings.accentColor) {
    appliedAccent = { color: settings.accentColor, cache: settings.accentColor === DEFAULT_ACCENT ? null : accentCache(settings.accentColor) };
    cacheSchemes(appliedAccent.cache);
  }
  applyScheme(root, appliedAccent.cache ? appliedAccent.cache[resolved] : null);
}

/**
 * Runs in the head before anything paints: theme, density, the band's Material 3 colors (cached by
 * applySettingsToDocument) and the home layout (src/lib/home/layout.ts), so a reload never flashes the defaults.
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
    // The navigation drawer's state (src/lib/sidebar/sidebar-store.ts), so the content starts at its final offset.
    if (sessionStorage.getItem(${JSON.stringify(storageKeys.sidebarOpen)}) === 'false') {
      root.dataset.sidebar = 'closed';
    }
  } catch(e) {}
  try {
    var accent = typeof settings.accentColor === 'string' ? settings.accentColor.toUpperCase() : '';
    var cached = JSON.parse(localStorage.getItem(${JSON.stringify(ACCENT_PALETTE_STORAGE_KEY)}) || 'null');
    var colors = cached && cached.version === ${ACCENT_CACHE_VERSION} && accent && String(cached.color).toUpperCase() === accent ? cached[resolved] : null;
    if (colors && typeof colors === 'object') {
      var roles = ${JSON.stringify(MD3_ROLES)};
      for (var i = 0; i < roles.length; i++) {
        var hex = colors[roles[i]];
        if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) continue;
        var name = '--md-sys-color-' + roles[i].replace(/[A-Z]/g, function(m){ return '-' + m.toLowerCase(); });
        var n = parseInt(hex.slice(1), 16);
        root.style.setProperty(name, hex);
        root.style.setProperty(name + '-rgb', ((n >> 16) & 255) + ' ' + ((n >> 8) & 255) + ' ' + (n & 255));
      }
      root.dataset.accent = 'band';
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
  try {
    var search = window.location.search;
    if (/[?&]spoiler=allow(?:&|$)/i.test(search)) {
      localStorage.setItem(${JSON.stringify(storageKeys.showSpoiler)}, '1');
    } else if (/[?&]spoiler=(?:disallow|deny|disable|reset)(?:&|$)/i.test(search)) {
      localStorage.setItem(${JSON.stringify(storageKeys.showSpoiler)}, '0');
    }
  } catch(e) {}
})();`;
}

/**
 * Runs in the head before anything paints. The server always renders the navigation drawer fully expanded (its links
 * must work without JavaScript); when the reader folded groups, this injects a stylesheet that hides exactly those
 * group bodies and points their chevrons the right way, so the very first paint already matches the stored folds.
 * A group entered from outside is left expanded, matching `resolveNavGroupEntry` in src/lib/sidebar/nav-groups.ts.
 *
 * React removes the stylesheet once its own collapsed state is on the DOM (`src/components/shell/Sidebar.tsx`). The
 * timeout is the fallback for a bundle that never hydrates: showing everything expanded beats leaving groups hidden.
 */
export function buildNavGroupBootstrapScript(activeGroupId?: string): string {
  return `
(function(){
  try {
    var saved = JSON.parse(localStorage.getItem(${JSON.stringify(storageKeys.navGroups)}) || 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
    var active = ${JSON.stringify(activeGroupId ?? "")};
    var previous = null;
    try { previous = sessionStorage.getItem(${JSON.stringify(storageKeys.navActiveGroup)}); } catch(e) {}
    // The active group opens once when its page is entered from outside the group, so do not hide it here either.
    var entering = !!active && previous !== active;
    var css = '';
    for (var id in saved) {
      if (saved[id] !== true || id === '__proto__' || !/^[A-Za-z0-9_-]+$/.test(id) || (entering && id === active)) continue;
      css += '#' + ${JSON.stringify(NAV_GROUP_LIST_PREFIX)} + id + '{display:none!important}';
      css += '[' + ${JSON.stringify(NAV_GROUP_CHEVRON_ATTRIBUTE)} + '="' + id + '"] svg{rotate:0deg!important}';
    }
    if (!css) return;
    document.documentElement.dataset.navGroups = 'pending';
    var style = document.createElement('style');
    style.id = ${JSON.stringify(NAV_GROUPS_STYLE_ID)};
    style.textContent = css;
    document.head.appendChild(style);
    setTimeout(function(){
      var injected = document.getElementById(${JSON.stringify(NAV_GROUPS_STYLE_ID)});
      if (injected && injected.parentNode) injected.parentNode.removeChild(injected);
      if (document.documentElement.dataset.navGroups === 'pending') delete document.documentElement.dataset.navGroups;
    }, 4000);
  } catch(e) {}
})();`;
}

/**
 * Runs right after the server-rendered drawer, before the first paint. The drawer's scroll offset lives in session
 * storage (src/components/shell/Sidebar.tsx); restoring it here keeps the list where the reader left it instead of
 * starting at the top and jumping down once React hydrates.
 */
export function buildSidebarScrollBootstrapScript(): string {
  return `
(function(){
  try {
    var nav = document.querySelector('.mn-desktop-sidebar nav[data-sidebar-nav]');
    var saved = parseInt(sessionStorage.getItem(${JSON.stringify(storageKeys.sidebarScroll)}) || '', 10);
    if (nav && isFinite(saved) && saved > 0) nav.scrollTop = saved;
  } catch(e) {}
})();`;
}

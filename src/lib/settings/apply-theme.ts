import type { AppSettings, ColorScheme } from "@/types/settings";

export function resolveColorScheme(colorScheme: ColorScheme): "light" | "dark" {
  if (colorScheme === "light" || colorScheme === "dark") return colorScheme;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applySettingsToDocument(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const resolved = resolveColorScheme(settings.colorScheme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = settings.colorScheme;
  root.dataset.animationLevel = settings.animationLevel;
  root.dataset.sidebarMode = settings.sidebarMode;
  root.dataset.assetSource = settings.assetSource;
  root.dataset.masterdataSource = settings.masterdataSource;
  root.dataset.commandPalette = String(settings.enableCommandPalette);
  root.dataset.breadcrumbDropdown = String(settings.enableBreadcrumbDropdown);
  root.style.colorScheme = resolved;
}

export function buildThemeBootstrapScript(): string {
  return `
(function(){
  try {
    var raw = localStorage.getItem('moenotes:settings');
    var settings = raw ? JSON.parse(raw) : {};
    var colorScheme = ['system','light','dark'].indexOf(settings.colorScheme) >= 0 ? settings.colorScheme : 'system';
    var resolved = colorScheme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : colorScheme;
    var animationDefault = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
    var animationLevel = ['full','reduced','off'].indexOf(settings.animationLevel) >= 0 ? settings.animationLevel : animationDefault;
    var sidebarMode = ['auto','expanded','collapsed'].indexOf(settings.sidebarMode) >= 0 ? settings.sidebarMode : 'auto';
    var assetSource = ['main','backup'].indexOf(settings.assetSource) >= 0 ? settings.assetSource : 'main';
    var masterdataSource = ['official','mirror'].indexOf(settings.masterdataSource) >= 0 ? settings.masterdataSource : 'official';
    var enableCommandPalette = typeof settings.enableCommandPalette === 'boolean' ? settings.enableCommandPalette : true;
    var enableBreadcrumbDropdown = typeof settings.enableBreadcrumbDropdown === 'boolean' ? settings.enableBreadcrumbDropdown : true;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = colorScheme;
    document.documentElement.dataset.animationLevel = animationLevel;
    document.documentElement.dataset.sidebarMode = sidebarMode;
    document.documentElement.dataset.assetSource = assetSource;
    document.documentElement.dataset.masterdataSource = masterdataSource;
    document.documentElement.dataset.commandPalette = String(enableCommandPalette);
    document.documentElement.dataset.breadcrumbDropdown = String(enableBreadcrumbDropdown);
    var sidebarOpen = sessionStorage.getItem('moenotes:sidebar-open');
    var effectiveSidebarOpen = sidebarMode === 'collapsed' ? false : sidebarMode === 'expanded' ? true : (sidebarOpen === null ? true : sidebarOpen === 'true');
    document.documentElement.dataset.sidebar = effectiveSidebarOpen ? 'open' : 'closed';
    document.documentElement.style.setProperty('--mn-sidebar-offset', effectiveSidebarOpen ? '18rem' : '2rem');
    document.documentElement.style.colorScheme = resolved;
  } catch(e) {}
})();`;
}

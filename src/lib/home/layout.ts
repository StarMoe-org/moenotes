import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeRemoveLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

/**
 * The home page's modules, their order and which are hidden. Every module is a direct child of the home page's flex
 * column marked `data-home-module`; the layout is applied as a stylesheet of `order` / `display: none` rules, which
 * the head's bootstrap script (src/lib/settings/apply-theme.ts) writes before the first paint from the stored value.
 */

export const HOME_MODULES = ["now", "event", "birthdays", "rewards", "music", "cards", "shortcuts"] as const;
export type HomeModuleId = (typeof HOME_MODULES)[number];

export interface HomeLayout {
  order: HomeModuleId[];
  hidden: HomeModuleId[];
}

export const HOME_LAYOUT_STORAGE_KEY = storageKeys.homeLayout;
export const HOME_LAYOUT_STYLE_ID = "mn-home-layout";
export const HOME_LAYOUT_CHANGED_EVENT = "moenotes:home-layout-changed";

export function defaultHomeLayout(): HomeLayout {
  return { order: [...HOME_MODULES], hidden: [] };
}

function isModule(value: unknown): value is HomeModuleId {
  return typeof value === "string" && (HOME_MODULES as readonly string[]).includes(value);
}

/**
 * A stored layout made valid: unknown and repeated modules dropped, modules it does not know (added in a later
 * version) inserted after the module that precedes them by default, so they appear where they were designed to.
 */
export function normalizeHomeLayout(raw: unknown): HomeLayout {
  if (!raw || typeof raw !== "object") return defaultHomeLayout();
  const value = raw as { order?: unknown; hidden?: unknown };
  const order: HomeModuleId[] = [];
  for (const id of Array.isArray(value.order) ? value.order : []) if (isModule(id) && !order.includes(id)) order.push(id);
  HOME_MODULES.forEach((id, index) => {
    if (order.includes(id)) return;
    const previous = HOME_MODULES.slice(0, index).reverse().find((other) => order.includes(other));
    order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, id);
  });
  const hidden = [...new Set(Array.isArray(value.hidden) ? value.hidden.filter(isModule) : [])];
  return { order, hidden };
}

export function isDefaultHomeLayout(layout: HomeLayout): boolean {
  return layout.hidden.length === 0 && layout.order.every((id, index) => id === HOME_MODULES[index]);
}

/** Moves a module one step up (-1) or down (1). */
export function moveHomeModule(layout: HomeLayout, id: HomeModuleId, step: -1 | 1): HomeLayout {
  const index = layout.order.indexOf(id);
  const target = index + step;
  if (index < 0 || target < 0 || target >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[index], order[target]] = [order[target]!, order[index]!];
  return { ...layout, order };
}

export function toggleHomeModule(layout: HomeLayout, id: HomeModuleId): HomeLayout {
  return { ...layout, hidden: layout.hidden.includes(id) ? layout.hidden.filter((entry) => entry !== id) : [...layout.hidden, id] };
}

/** The stylesheet that puts the modules in order (the bootstrap script builds the same rules). */
export function homeLayoutCss(layout: HomeLayout): string {
  return layout.order
    .map((id, index) => `[data-home-module="${id}"]{order:${index}${layout.hidden.includes(id) ? ";display:none!important" : ""}}`)
    .join("");
}

export function readHomeLayout(): HomeLayout {
  const raw = safeGetLocalStorage(HOME_LAYOUT_STORAGE_KEY);
  if (!raw) return defaultHomeLayout();
  try {
    return normalizeHomeLayout(JSON.parse(raw));
  } catch {
    return defaultHomeLayout();
  }
}

/** Stores the layout (the default one is forgotten) and applies it to the page. */
export function saveHomeLayout(layout: HomeLayout): void {
  if (isDefaultHomeLayout(layout)) safeRemoveLocalStorage(HOME_LAYOUT_STORAGE_KEY);
  else safeSetLocalStorage(HOME_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  applyHomeLayout(layout);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<HomeLayout>(HOME_LAYOUT_CHANGED_EVENT, { detail: layout }));
}

export function applyHomeLayout(layout: HomeLayout): void {
  if (typeof document === "undefined") return;
  let style = document.getElementById(HOME_LAYOUT_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = HOME_LAYOUT_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = homeLayoutCss(layout);
}

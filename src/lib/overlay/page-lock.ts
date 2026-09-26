import { useEffect, type RefObject } from "react";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";

/**
 * - `fullscreen`: a stage fills the screen.
 * - `locked`: the viewer locked it, so every touch is ignored and only the stage stays interactive.
 */
export type PageLockMode = "off" | "fullscreen" | "locked";

const LOCK_KEY = "page-lock";
// WebKit's pinch events: cancelling them keeps iOS Safari from zooming the page.
const GESTURE_EVENTS = ["gesturestart", "gesturechange", "gestureend"] as const;

/**
 * Keeps the page still on touch screens (iOS Safari first) while a stage is fullscreen or locked:
 * - no page scroll, overscroll bounce or pull-to-refresh
 * - no pinch or double-tap zoom
 * - no long-press menu
 *
 * In `fullscreen`, sliders and scrollable areas (the settings panel) still take a one-finger drag. In `locked`, every
 * drag is cancelled, text selection is off and everything outside `stage` is inert.
 */
export function usePageLock(mode: PageLockMode, stage: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (mode === "off") return;
    const locked = mode === "locked";
    const restoreStyles = setStyles(document.documentElement, {
      "overscroll-behavior": "none",
      "touch-action": locked ? "none" : "manipulation",
      "-webkit-touch-callout": "none",
      ...(locked ? { "-webkit-user-select": "none", "user-select": "none" } : {}),
    });
    lockBodyScroll(LOCK_KEY);
    const onTouchMove = (event: TouchEvent) => {
      if (locked || event.touches.length > 1 || !takesDrag(event)) event.preventDefault();
    };
    const prevent = (event: Event) => event.preventDefault();
    const listener = { passive: false } as const;
    document.addEventListener("touchmove", onTouchMove, listener);
    for (const type of GESTURE_EVENTS) document.addEventListener(type, prevent, listener);
    document.addEventListener("contextmenu", prevent);
    const inerted = locked && stage.current ? inertAround(stage.current) : [];
    return () => {
      restoreStyles();
      unlockBodyScroll(LOCK_KEY);
      document.removeEventListener("touchmove", onTouchMove);
      for (const type of GESTURE_EVENTS) document.removeEventListener(type, prevent);
      document.removeEventListener("contextmenu", prevent);
      for (const element of inerted) element.inert = false;
    };
  }, [mode, stage]);
}

/** Whether a one-finger drag belongs to something under it: a slider, or an area that can scroll. */
function takesDrag(event: TouchEvent): boolean {
  for (const target of event.composedPath()) {
    if (target === document.body || target === document.documentElement) return false;
    if (!(target instanceof Element)) continue;
    if (target instanceof HTMLInputElement && target.type === "range") return true;
    const style = getComputedStyle(target);
    if (scrolls(style.overflowY) && target.scrollHeight > target.clientHeight) return true;
    if (scrolls(style.overflowX) && target.scrollWidth > target.clientWidth) return true;
  }
  return false;
}

function scrolls(overflow: string): boolean {
  return overflow === "auto" || overflow === "scroll";
}

/** Makes everything on the page but `element` and its ancestors inert; returns what it changed. */
function inertAround(element: HTMLElement): HTMLElement[] {
  const changed: HTMLElement[] = [];
  for (let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      sibling.inert = true;
      changed.push(sibling);
    }
  }
  return changed;
}

function setStyles(element: HTMLElement, styles: Record<string, string>): () => void {
  const previous = Object.keys(styles).map((name) => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)] as const);
  for (const [name, value] of Object.entries(styles)) element.style.setProperty(name, value);
  return () => {
    for (const [name, value, priority] of previous) {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    }
  };
}

// The Fullscreen API with WebKit's prefixed names (iPadOS Safari before 16.4). iPhone Safari has no element
// fullscreen at all; callers fall back to a page-filling layout there.

type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };

export const FULLSCREEN_CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange"] as const;

export function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** Puts `element` in fullscreen; rejects where the browser offers no element fullscreen or refuses it. */
export function requestElementFullscreen(element: HTMLElement): Promise<void> {
  const doc = document as FullscreenDocument;
  const target = element as FullscreenElement;
  if (doc.fullscreenEnabled && typeof target.requestFullscreen === "function") {
    return target.requestFullscreen({ navigationUI: "hide" });
  }
  if (doc.webkitFullscreenEnabled && typeof target.webkitRequestFullscreen === "function") {
    target.webkitRequestFullscreen();
    return Promise.resolve();
  }
  return Promise.reject(new Error("element fullscreen is not available"));
}

export function exitElementFullscreen(): void {
  const doc = document as FullscreenDocument;
  if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => undefined);
  else doc.webkitExitFullscreen?.();
}

/** Turns a phone or tablet to landscape while in fullscreen, where the browser allows it (Android); a no-op elsewhere. */
export function lockLandscape(): void {
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  const orientation = screen.orientation as (ScreenOrientation & { lock?: (orientation: string) => Promise<void> }) | undefined;
  orientation?.lock?.("landscape").catch(() => undefined);
}

import { useCallback, useEffect, useState } from "react";
import { safeGetLocalStorage, safeGetSessionStorage, safeSetLocalStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";

/** Every display a collection page can offer; a page picks the ones it supports. */
export const collectionViews = ["grid", "list", "table", "card", "square"] as const;
export type CollectionView = typeof collectionViews[number];

export interface CollectionViewOptions {
  /** Where the choice is remembered: per tab (default) or across visits. */
  storage?: "session" | "local";
  /** Storage key (default `moenotes:view:<page>`). */
  storageKey?: string;
  /** Mirror the choice in the URL's query string (default true), so a shared link opens in the same view. */
  syncUrl?: boolean;
  /** Query parameter name (default `view`). */
  param?: string;
}

/**
 * The reader's chosen view of a collection page. Hydrates as `defaultView`, then takes `?view=` when it names one of
 * `views`, else the remembered choice. Picking a view remembers it and (with `syncUrl`) writes `?view=` on the current
 * history entry, leaving it out for the default view.
 */
export function useCollectionView<V extends CollectionView>(
  page: string,
  views: readonly V[],
  defaultView: V,
  options: CollectionViewOptions = {},
): [V, (view: V) => void] {
  const { storage = "session", syncUrl = true, param = "view" } = options;
  const storageKey = options.storageKey ?? `moenotes:view:${page}`;
  const viewKey = views.join(",");
  const [view, setView] = useState<V>(defaultView);

  useEffect(() => {
    const allowed = viewKey.split(",");
    const isView = (value: string | null): value is V => value !== null && allowed.includes(value);
    const fromUrl = syncUrl ? readQueryParam(param) : null;
    const saved = storage === "local" ? safeGetLocalStorage(storageKey) : safeGetSessionStorage(storageKey);
    const next = isView(fromUrl) ? fromUrl : isView(saved) ? saved : defaultView;
    setView(next);
    // A `?view=` naming no view of this page is dropped rather than left to mislead.
    if (syncUrl && fromUrl !== null && !isView(fromUrl)) replaceQueryParam(param, null);
  }, [storageKey, storage, syncUrl, param, viewKey, defaultView]);

  const pick = useCallback((next: V) => {
    setView(next);
    if (storage === "local") safeSetLocalStorage(storageKey, next);
    else safeSetSessionStorage(storageKey, next);
    if (syncUrl) replaceQueryParam(param, next === defaultView ? null : next);
  }, [storage, storageKey, syncUrl, param, defaultView]);

  return [view, pick];
}

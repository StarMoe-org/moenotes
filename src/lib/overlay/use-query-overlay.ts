import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";

export interface QueryOverlayOptions<T> {
  /** Reads the parameter; null rejects it (the overlay stays closed). Default: the raw string, blank rejected. */
  parse?: (raw: string) => T | null;
  /** Writes the parameter (default `String`). */
  serialize?: (value: T) => string;
  /**
   * Whether a value actually opens something (e.g. the id is in the list). Only then is the parameter written; an
   * unknown id from a stale link leaves the URL clean. Default: every parsed value does.
   */
  isShown?: (value: T) => boolean;
}

export interface QueryOverlay<T> {
  /** The value the overlay is open for, or null. */
  value: T | null;
  open: (value: T) => void;
  close: () => void;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A positive integer id parameter (`?item=12`), for `parse`. */
export function parsePositiveIntParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Overlay state mirrored in a query parameter (`?item=<id>`), for list pages that open entries in a DetailOverlay.
 *
 * - First load: a parameter opens the overlay (deep link).
 * - History: the deep link's parameter leaves the landing entry before Modal pushes its own (a layout effect runs before
 *   every passive effect, Modal's included), so closing — Modal steps back — lands on a clean list URL. While a value is
 *   open its parameter sits on Modal's entry, written after the push (child effects run first); every write replaces
 *   the entry and keeps `history.state`, which Modal relies on.
 * - Back closes the overlay (Modal's popstate handling), and the URL is clean again.
 *
 * Render the DetailOverlay/Modal inside the component that calls this hook so the effect order above holds.
 */
export function useQueryOverlay<T = string>(param: string, options: QueryOverlayOptions<T> = {}): QueryOverlay<T> {
  const { parse, serialize = String, isShown } = options;
  const [value, setValue] = useState<T | null>(() => {
    const raw = readQueryParam(param);
    if (raw === null) return null;
    return parse ? parse(raw) : (raw.trim() ? (raw as unknown as T) : null);
  });

  useIsomorphicLayoutEffect(() => {
    if (readQueryParam(param) !== null) replaceQueryParam(param, null);
    // Only the landing entry: later writes belong to Modal's entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = value !== null && (isShown ? isShown(value) : true);
  const written = shown ? serialize(value as T) : null;
  useEffect(() => {
    if (written !== null) replaceQueryParam(param, written);
  }, [param, written]);

  const open = useCallback((next: T) => setValue(() => next), []);
  const close = useCallback(() => setValue(null), []);
  return { value, open, close };
}

import type { OverlayId, OverlayState } from "@/types/overlay";

export type OverlayListener = (state: OverlayState) => void;

let state: OverlayState = { activeOverlay: null };
const listeners = new Set<OverlayListener>();

export function getOverlayState(): OverlayState {
  return state;
}

export function getActiveOverlay(): OverlayId | null {
  return state.activeOverlay;
}

export function openOverlay(id: OverlayId): OverlayState {
  state = { activeOverlay: id };
  emit();
  return state;
}

export function closeOverlay(id?: OverlayId): OverlayState {
  if (id && state.activeOverlay !== id) return state;
  state = { activeOverlay: null };
  emit();
  return state;
}

export function toggleOverlay(id: OverlayId): OverlayState {
  return state.activeOverlay === id ? closeOverlay(id) : openOverlay(id);
}

export function subscribeOverlay(listener: OverlayListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener(state);
}

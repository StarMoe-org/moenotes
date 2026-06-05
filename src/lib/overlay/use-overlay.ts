import { useCallback, useEffect, useState } from "react";
import { closeOverlay, getOverlayState, openOverlay, subscribeOverlay, toggleOverlay } from "@/lib/overlay/overlay-store";
import type { OverlayId, OverlayState } from "@/types/overlay";

export function useOverlay(id: OverlayId) {
  const [state, setState] = useState<OverlayState>(() => getOverlayState());

  useEffect(() => subscribeOverlay(setState), []);

  const open = useCallback(() => openOverlay(id), [id]);
  const close = useCallback(() => closeOverlay(id), [id]);
  const toggle = useCallback(() => toggleOverlay(id), [id]);

  return {
    isOpen: state.activeOverlay === id,
    activeOverlay: state.activeOverlay,
    open,
    close,
    toggle,
  };
}

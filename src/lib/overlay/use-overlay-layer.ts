import { useEffect } from "react";
import { pushOverlayLayer, removeOverlayLayer } from "@/lib/overlay/layer-stack";

/**
 * Register an MUI overlay (dialog/drawer) in the shared overlay layer stack
 * while open, so Escape only closes the topmost overlay when MUI and legacy
 * overlays overlap.
 */
export function useOverlayLayer(key: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    pushOverlayLayer(key);
    return () => removeOverlayLayer(key);
  }, [key, active]);
}

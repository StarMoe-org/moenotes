import type { ModelPlayer } from "ournotes-player/live2d";

/**
 * Zoom and pan of a model on the Live2D stage. The player fits the model's canvas into its drawing buffer with an
 * orthographic camera and has no view option, so the view is a transform in normalized device coordinates applied to
 * the camera's view-projection matrix: `ndc' = zoom * ndc + (x, y)`. That is the camera zooming and moving (the mask
 * texture is drawn in model space, so it is unaffected), and the model stays sharp at any zoom. It relies on the pinned
 * ournotes-player's `ModelSession._globals` (the camera globals of a frame); a player without it falls back to a CSS
 * transform of the player's element.
 */
export interface Live2DView {
  zoom: number;
  /** Offset in normalized device coordinates (-1..1 across the stage). */
  x: number;
  y: number;
}

export const IDENTITY_VIEW: Live2DView = { zoom: 1, x: 0, y: 0 };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

/** A view kept in range: zoom within [MIN_ZOOM, MAX_ZOOM], the offset leaving part of the model on the stage. */
export function clampView(view: Live2DView): Live2DView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const limit = zoom - 1 + 0.25 * (zoom > 1 ? 1 : 0);
  // `+ 0` turns -0 into 0, so a clamped view equals the identity view
  const clamp = (value: number) => Math.min(limit, Math.max(-limit, value)) + 0;
  return { zoom, x: clamp(view.x), y: clamp(view.y) };
}

/**
 * The view after zooming by `factor` about a point of the stage given in normalized device coordinates (the point
 * stays under the cursor or between the fingers).
 */
export function zoomAbout(view: Live2DView, factor: number, px: number, py: number): Live2DView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  // the model point under (px, py): p = zoom * q + offset
  const qx = (px - view.x) / view.zoom, qy = (py - view.y) / view.zoom;
  return clampView({ zoom, x: px - zoom * qx, y: py - zoom * qy });
}

/** A stage point in CSS pixels as normalized device coordinates (y up, as GL). */
export function toNdc(clientX: number, clientY: number, rect: DOMRect): [number, number] {
  return [((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2];
}

interface CameraGlobals {
  unity_MatrixVP: Float32Array;
  [key: string]: unknown;
}
interface SessionWithCamera {
  _globals?: (width: number, height: number) => CameraGlobals;
  render(): void;
  disposed: boolean;
}

/** Column-major 4x4 product a * b. */
function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      out[column * 4 + row] = sum;
    }
  return out;
}

/**
 * Attaches the view to a loaded player; returns the function that sets it (drawn at the next frame, or at once while the
 * player is paused).
 */
export function attachLive2DView(player: ModelPlayer): (view: Live2DView) => void {
  const session = player.session as unknown as SessionWithCamera | null;
  let current = IDENTITY_VIEW;
  const original = session?._globals;
  if (session && typeof original === "function") {
    session._globals = (width, height) => {
      const globals = original.call(session, width, height);
      if (current.zoom === 1 && current.x === 0 && current.y === 0) return globals;
      const { zoom, x, y } = current;
      const view = new Float32Array([zoom, 0, 0, 0, 0, zoom, 0, 0, 0, 0, 1, 0, x, y, 0, 1]);
      return { ...globals, unity_MatrixVP: multiply(view, globals.unity_MatrixVP) };
    };
    return (view) => {
      current = view;
      if (player.paused && !session.disposed) session.render();
    };
  }
  // Fallback: scale the player's element (sharpness is lost when zoomed in).
  const root = player.root;
  root.style.transformOrigin = "50% 50%";
  return (view) => {
    current = view;
    root.style.transform = `translate(${(view.x * 50).toFixed(3)}%, ${(-view.y * 50).toFixed(3)}%) scale(${view.zoom})`;
  };
}

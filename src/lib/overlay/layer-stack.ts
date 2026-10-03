/**
 * Stack of open modal layers (Modal, Lightbox, …), so that Escape, Tab trapping and the browser's Back button only
 * act on the top one. Layers share it so a Lightbox opened over a Modal closes first.
 */
const layers: string[] = [];

export function pushOverlayLayer(key: string): void {
  layers.push(key);
}

export function removeOverlayLayer(key: string): void {
  const index = layers.lastIndexOf(key);
  if (index >= 0) layers.splice(index, 1);
}

export function isTopOverlayLayer(key: string): boolean {
  return layers[layers.length - 1] === key;
}

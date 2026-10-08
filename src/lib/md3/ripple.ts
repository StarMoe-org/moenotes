/**
 * Framework-free MD3 ripple: pointerdown on an `.md3-ripple` container spawns
 * a `.md3-ripple-ink` span sized to cover the container from the touch point.
 * React wrappers call spawnMdRipple from onPointerDown; static Astro markup
 * simply omits the handler (hover/pressed state layers still apply).
 */

export const MD_RIPPLE_CLASS = "md3-ripple";
const INK_CLASS = "md3-ripple-ink";

export function spawnMdRipple(event: { currentTarget: EventTarget | null; clientX: number; clientY: number }): void {
  const container = event.currentTarget;
  if (!(container instanceof HTMLElement)) return;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = container.getBoundingClientRect();
  const diameter = Math.max(rect.width, rect.height) * 2.2;
  const ink = document.createElement("span");
  ink.className = INK_CLASS;
  ink.setAttribute("aria-hidden", "true");
  ink.style.width = `${diameter}px`;
  ink.style.height = `${diameter}px`;
  ink.style.left = `${event.clientX - rect.left - diameter / 2}px`;
  ink.style.top = `${event.clientY - rect.top - diameter / 2}px`;
  ink.addEventListener("animationend", () => ink.remove(), { once: true });
  container.appendChild(ink);
}

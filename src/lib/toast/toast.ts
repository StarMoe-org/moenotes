/**
 * Toasts: short notices stacked in a corner of the viewport (bottom-right on wide screens, bottom-centre on narrow
 * ones) that never take the focus. Plain DOM, so any page or island can show one without hydrating anything; the
 * look is `.mn-toast` in src/styles/components.css.
 */

export type ToastIcon = "update" | "info" | "success" | "warning";

export interface ToastAction {
  label: string;
  /** The emphasized action; at most one per toast. */
  primary?: boolean | undefined;
  onSelect?: (() => void) | undefined;
  /** Leaves the toast open after the action ran. */
  keepOpen?: boolean | undefined;
}

export interface ToastOptions {
  /** A toast shown with the same id replaces the open one. */
  id?: string | undefined;
  title: string;
  description?: string | undefined;
  icon?: ToastIcon | undefined;
  actions?: readonly ToastAction[] | undefined;
  /** Accessible name of a close button; without it the toast has none and closes through its actions. */
  closeLabel?: string | undefined;
  /** Closes by itself after this long while it is seen (not hovered, not focused, tab visible); omitted: stays. */
  durationMs?: number | undefined;
  /** Announced at once (`role="alert"`) instead of after what the reader hears now. */
  urgent?: boolean | undefined;
  onClose?: (() => void) | undefined;
}

export interface ToastHandle {
  close(): void;
}

const ICON_PATHS: Record<ToastIcon, string> = {
  update: '<path d="M20 11.5A8 8 0 0 0 5.6 6.6L4 8.5"/><path d="M4 3.5v5h5"/><path d="M4 12.5a8 8 0 0 0 14.4 4.9l1.6-1.9"/><path d="M20 20.5v-5h-5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/>',
  success: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.4"/>',
  warning: '<path d="M10.3 4.6 3.4 16.8A2 2 0 0 0 5.1 19.8h13.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4"/><path d="M12 16.6v.1"/>',
};
const CLOSE_PATH = '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>';
/** Removal waits at most this long for the closing animation (none runs when animations are off). */
const CLOSE_FALLBACK_MS = 400;

const open = new Map<string, ToastHandle>();

function svg(paths: string, className: string): HTMLElement {
  const holder = document.createElement("span");
  holder.className = className;
  holder.setAttribute("aria-hidden", "true");
  holder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return holder;
}

/** The live region holding the toasts; created on first use, so the first toast enters it a frame later. */
function toaster(): { host: HTMLElement; created: boolean } {
  const existing = document.querySelector<HTMLElement>("body > .mn-toaster");
  if (existing) return { host: existing, created: false };
  const host = document.createElement("div");
  host.className = "mn-toaster";
  host.setAttribute("aria-live", "polite");
  document.body.append(host);
  return { host, created: true };
}

export function showToast(options: ToastOptions): ToastHandle {
  if (options.id) open.get(options.id)?.close();

  const toast = document.createElement("div");
  toast.className = "mn-toast";
  if (options.urgent) toast.setAttribute("role", "alert");
  if (options.icon) {
    toast.dataset.icon = options.icon;
    toast.append(svg(ICON_PATHS[options.icon], "mn-toast-icon"));
  }

  const body = document.createElement("div");
  body.className = "mn-toast-body";
  const title = document.createElement("p");
  title.className = "mn-toast-title";
  title.textContent = options.title;
  body.append(title);
  if (options.description) {
    const text = document.createElement("p");
    text.className = "mn-toast-text";
    text.textContent = options.description;
    body.append(text);
  }
  toast.append(body);

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pauses = new Set<"pointer" | "focus" | "hidden">();
  let remaining = options.durationMs ?? 0;
  let startedAt = 0;

  const onVisibility = () => setPaused("hidden", document.visibilityState === "hidden");
  const handle: ToastHandle = {
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (options.id && open.get(options.id) === handle) open.delete(options.id);
      toast.dataset.state = "closing";
      const remove = () => toast.remove();
      toast.addEventListener("animationend", remove, { once: true });
      setTimeout(remove, CLOSE_FALLBACK_MS);
      options.onClose?.();
    },
  };

  if (options.closeLabel) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "mn-toast-close";
    close.setAttribute("aria-label", options.closeLabel);
    close.title = options.closeLabel;
    close.append(svg(CLOSE_PATH, "mn-toast-close-icon"));
    close.addEventListener("click", () => handle.close());
    toast.append(close);
  }

  if (options.actions?.length) {
    const actions = document.createElement("div");
    actions.className = "mn-toast-actions";
    for (const action of options.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mn-toast-action";
      if (action.primary) button.dataset.primary = "";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        action.onSelect?.();
        if (!action.keepOpen) handle.close();
      });
      actions.append(button);
    }
    toast.append(actions);
  }

  function run() {
    startedAt = Date.now();
    timer = setTimeout(() => handle.close(), Math.max(0, remaining));
  }
  function setPaused(reason: "pointer" | "focus" | "hidden", paused: boolean) {
    if (closed || !options.durationMs) return;
    const before = pauses.size > 0;
    if (paused) pauses.add(reason);
    else pauses.delete(reason);
    const after = pauses.size > 0;
    if (before === after) return;
    if (after) {
      clearTimeout(timer);
      remaining -= Date.now() - startedAt;
      toast.dataset.paused = "";
    } else {
      delete toast.dataset.paused;
      run();
    }
  }

  if (options.durationMs) {
    const progress = document.createElement("span");
    progress.className = "mn-toast-progress";
    progress.style.animationDuration = `${options.durationMs}ms`;
    toast.append(progress);
    toast.addEventListener("pointerenter", () => setPaused("pointer", true));
    toast.addEventListener("pointerleave", () => setPaused("pointer", false));
    toast.addEventListener("focusin", () => setPaused("focus", true));
    toast.addEventListener("focusout", (event) => {
      if (!toast.contains(event.relatedTarget as Node | null)) setPaused("focus", false);
    });
    document.addEventListener("visibilitychange", onVisibility);
    run();
    onVisibility();
  }
  toast.addEventListener("keydown", (event) => {
    if (event.key === "Escape") handle.close();
  });

  if (options.id) open.set(options.id, handle);
  // A region announces what is added to it once it exists.
  const { host, created } = toaster();
  if (created) requestAnimationFrame(() => host.append(toast));
  else host.append(toast);
  return handle;
}

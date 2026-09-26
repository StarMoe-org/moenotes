import type { ChartPlayer } from "ournotes-player";

/*
 * Moenotes' layout of the ournotes-player controls. The bar is compact: play, time, seek, then settings, lock and
 * fullscreen as icon buttons. The playback speed and the note speed steppers move to a strip under the settings
 * panel's title (the panel's Basic tab keeps its own note speed row).
 *
 * It works on the markup of the player's controls (src/player/controls.js as of 6b9b62f) in the player's open shadow
 * root: `.controls` holds the `.bar` (`.speed-label`, `.note-speed`, and the settings button, `aria-haspopup="dialog"`)
 * and, once first opened, the settings panel (`role="dialog"` with a `.panel-head`, `.busy` while applying, and its
 * note speed row, `.row[data-name="NoteSpeed"]`). If a later version renames a part, the player keeps that part where it
 * put it.
 */

const STYLE = `
.bar.compact .speed-label, .bar.compact .note-speed { display: none; }
.icon { display: inline-grid; place-items: center; min-width: 36px; padding: 0; }
.icon svg { width: 18px; height: 18px; pointer-events: none; }
.tray { position: absolute; top: 8px; right: 8px; display: flex; gap: 6px; }
.speeds { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; flex: none; padding: 8px 12px;
          border-bottom: 1px solid rgba(255,255,255,.12); }
.panel-body, .tabs { overscroll-behavior: contain; }
input { -webkit-user-select: text; user-select: text; }
:host(.locked) .controls { display: none; }
`;

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** The site header's gear, plus the stage's lock and fullscreen glyphs. */
const ICONS = {
  settings: svg(
    '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.6 15a1.8 1.8 0 0 0-1.65-1.1H2a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 3.7 8.6a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.97-2.97l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 9.4 2.35V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1H21a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z"/>',
  ),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.75-1.4"/>'),
  fullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitFullscreen: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
};

export interface StageControlLabels {
  lock: string;
  fullscreen: string;
  exitFullscreen: string;
}

export interface StageControlActions {
  onLock: () => void;
  onFullscreen: () => void;
}

export interface StageControls {
  /** Shows the fullscreen button's enter or exit state. */
  setFullscreen: (on: boolean) => void;
  dispose: () => void;
}

export function customizeControls(player: ChartPlayer, labels: StageControlLabels, actions: StageControlActions): StageControls {
  const shadow = player.root.shadowRoot;
  if (!shadow) return { setFullscreen: () => undefined, dispose: () => undefined };
  const doc = player.root.ownerDocument;
  const style = doc.createElement("style");
  style.textContent = STYLE;
  shadow.append(style);

  const bar = shadow.querySelector<HTMLElement>(".controls > .bar");
  const settings = bar?.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]');
  if (settings) setIcon(settings, ICONS.settings, settings.textContent ?? "");

  const lock = iconButton(doc, ICONS.lock, labels.lock, actions.onLock);
  const fullscreen = iconButton(doc, ICONS.fullscreen, labels.fullscreen, actions.onFullscreen);
  (bar ?? tray(doc, shadow)).append(lock, fullscreen);

  // The panel is built on its first opening; the speeds move into it then.
  const controls = bar?.parentElement;
  const speeds = [bar?.querySelector(".speed-label"), bar?.querySelector(".note-speed")].filter((node) => node != null);
  if (bar && speeds.length) bar.classList.add("compact");
  let watch: MutationObserver | null = null;
  let unhold: () => void = () => undefined;
  if (controls) {
    const setUp = () => {
      const panel = controls.querySelector('[role="dialog"]');
      if (!panel) return false;
      if (speeds.length) {
        const strip = doc.createElement("div");
        strip.className = "speeds";
        strip.append(...speeds);
        const head = panel.querySelector(".panel-head");
        if (head) head.after(strip);
        else panel.prepend(strip);
      }
      unhold = holdNoteSpeedSlider(panel);
      return true;
    };
    if (!setUp()) {
      watch = new MutationObserver(() => {
        if (setUp()) watch?.disconnect();
      });
      watch.observe(controls, { childList: true });
    }
  }

  return {
    setFullscreen: (on) => setIcon(fullscreen, on ? ICONS.exitFullscreen : ICONS.fullscreen, on ? labels.exitFullscreen : labels.fullscreen),
    dispose: () => {
      watch?.disconnect();
      unhold();
    },
  };
}

/*
 * While a chart plays, the player writes the note speed in effect into the panel's note speed row on every frame
 * (ChartControls._showNoteSpeed, which finds the row by its `data-name`). A drag of the row's slider jumps back each
 * frame, and on release its change reads the old value and is dropped. While the slider is held the row goes without
 * its name, out of reach of those writes; the slider's own listeners keep the number field in step and apply the value.
 * On release the name comes back, unless the change is being applied (`.busy`): the panel then draws the row anew.
 */
function holdNoteSpeedSlider(panel: Element): () => void {
  const doc = panel.ownerDocument;
  let held: HTMLElement | null = null;
  let timer = 0;
  const grab = (event: Event) => {
    const input = event.target;
    const row = input instanceof HTMLInputElement && input.type === "range" ? input.closest<HTMLElement>('.row[data-name="NoteSpeed"]') : null;
    if (!row) return;
    held = row;
    delete row.dataset.name;
  };
  const release = () => {
    const row = held;
    if (!row) return;
    held = null;
    // After the slider's change, which the same pointer release fires.
    timer = window.setTimeout(() => {
      if (!panel.classList.contains("busy")) row.dataset.name = "NoteSpeed";
    });
  };
  panel.addEventListener("pointerdown", grab);
  doc.addEventListener("pointerup", release, true);
  doc.addEventListener("pointercancel", release, true);
  return () => {
    window.clearTimeout(timer);
    panel.removeEventListener("pointerdown", grab);
    doc.removeEventListener("pointerup", release, true);
    doc.removeEventListener("pointercancel", release, true);
  };
}

function iconButton(doc: Document, icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.addEventListener("click", onClick);
  return setIcon(button, icon, label);
}

function setIcon(button: HTMLButtonElement, icon: string, label: string): HTMLButtonElement {
  button.classList.add("icon");
  button.innerHTML = icon;
  button.setAttribute("aria-label", label);
  button.title = label;
  return button;
}

/** Where the buttons go when the player has no bar to put them in. */
function tray(doc: Document, shadow: ShadowRoot): HTMLElement {
  const element = doc.createElement("div");
  element.className = "tray";
  shadow.append(element);
  return element;
}

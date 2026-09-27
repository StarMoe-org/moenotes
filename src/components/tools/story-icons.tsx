import type { ReactNode } from "react";
import type { StoryVolumeCategory } from "@/lib/story/player-settings";

/** The story player's glyphs (24×24, 1.8 stroke like the stage controls of the chart previewer). */

function Glyph({ className = "h-5 w-5", children }: { className?: string | undefined; children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export function PlayIcon({ className }: IconProps) {
  return <Glyph className={className}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></Glyph>;
}

export function PauseIcon({ className }: IconProps) {
  return <Glyph className={className}><rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" /></Glyph>;
}

/** The next line: a step forward. */
export function NextLineIcon({ className }: IconProps) {
  return <Glyph className={className}><path d="M6 5.5v13l9.5-6.5z" fill="currentColor" /><path d="M18.5 5.5v13" /></Glyph>;
}

/** Auto: a loop around a play mark. */
export function AutoIcon({ className }: IconProps) {
  return <Glyph className={className}><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4.5V9h-4.5" /><path d="M10 9v6l5-3z" fill="currentColor" /></Glyph>;
}

export function FastForwardIcon({ className }: IconProps) {
  return <Glyph className={className}><path d="M3.5 6.5v11L11 12z" fill="currentColor" /><path d="M12.5 6.5v11L20 12z" fill="currentColor" /></Glyph>;
}

/** Skip: on to the end. */
export function SkipIcon({ className }: IconProps) {
  return <Glyph className={className}><path d="m4.5 6 6 6-6 6" /><path d="m11 6 6 6-6 6" /><path d="M20 5v14" /></Glyph>;
}

/** The site header's gear. */
export function SettingsIcon({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.6 15a1.8 1.8 0 0 0-1.65-1.1H2a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 3.7 8.6a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.97-2.97l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 9.4 2.35V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1H21a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
    </Glyph>
  );
}

export function FullscreenIcon({ className, exit = false }: IconProps & { exit?: boolean }) {
  return <Glyph className={className}><path d={exit ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} /></Glyph>;
}

export function ReplayIcon({ className }: IconProps) {
  return <Glyph className={className}><path d="M4 12a8 8 0 1 0 2.34-5.66" /><path d="M4 4.5V9h4.5" /></Glyph>;
}

/** Shows the control bar on touch screens. */
export function ControlsIcon({ className }: IconProps) {
  return <Glyph className={className}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Glyph>;
}

export function InfoIcon({ className }: IconProps) {
  return <Glyph className={className}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></Glyph>;
}

/** The story list (the picker). */
export function StoryListIcon({ className }: IconProps) {
  return <Glyph className={className}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" /></Glyph>;
}

export function LanguageIcon({ className }: IconProps) {
  return <Glyph className={className}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Glyph>;
}

export function ChevronIcon({ className, direction }: IconProps & { direction: "left" | "right" | "down" }) {
  const d = direction === "left" ? "m15 6-6 6 6 6" : direction === "right" ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6";
  return <Glyph className={className}><path d={d} /></Glyph>;
}

export function CloseIcon({ className }: IconProps) {
  return <Glyph className={className}><path d="M6 18 18 6M6 6l12 12" /></Glyph>;
}

export function SpeakerIcon({ className, muted = false }: IconProps & { muted?: boolean }) {
  return (
    <Glyph className={className}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {muted ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />}
    </Glyph>
  );
}

/** Music, sound effects, voices and the videos' own sound. */
export function VolumeCategoryIcon({ className, category }: IconProps & { category: StoryVolumeCategory }) {
  switch (category) {
    case "Bgm":
      return <Glyph className={className}><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></Glyph>;
    case "Se":
      return <Glyph className={className}><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M6 18l2.1-2.1M15.9 8.1 18 6" /><circle cx="12" cy="12" r="2" /></Glyph>;
    case "Voice":
      return <Glyph className={className}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></Glyph>;
    case "Movie":
      return <Glyph className={className}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7.5 5v14M16.5 5v14M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21" /></Glyph>;
  }
}

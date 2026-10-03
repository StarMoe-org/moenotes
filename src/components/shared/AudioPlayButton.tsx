import { useSyncExternalStore } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getState, subscribe, toggle, type AudioStatus, type AudioTrack } from "@/lib/audio/player";

export interface AudioPlayButtonProps {
  locale: AppLocale;
  track: AudioTrack;
  size?: "sm" | "md" | "lg";
  /** Print the state next to the icon ("Play" / "Pause" …). */
  showLabel?: boolean;
  className?: string;
}

/** This track's status in the site-wide player (`idle` while another track is current). Re-renders only on its changes. */
function useTrackStatus(trackId: string): AudioStatus {
  return useSyncExternalStore(
    (onChange) => subscribe(() => onChange()),
    () => {
      const state = getState();
      return state.track?.id === trackId ? state.status : "idle";
    },
    () => "idle" as AudioStatus,
  );
}

const sizeClass = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" } as const;
const iconClass = { sm: "h-3.5 w-3.5", md: "h-4.5 w-4.5", lg: "h-5 w-5" } as const;

/** Play/pause one track through the site-wide player; starting it stops whatever else was playing. */
export default function AudioPlayButton({ locale, track, size = "md", showLabel = false, className = "" }: AudioPlayButtonProps) {
  const status = useTrackStatus(track.id);
  const active = status === "playing" || status === "loading";
  const labelKey = status === "playing" ? "audio.pause" : status === "loading" ? "audio.loading" : status === "error" ? "audio.retry" : "audio.play";
  const label = t(locale, labelKey);
  const name = `${label}: ${track.title}`;

  const icon = status === "loading" ? (
    <svg className={`${iconClass[size]} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
  ) : status === "playing" ? (
    <svg className={iconClass[size]} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
  ) : status === "error" ? (
    <svg className={iconClass[size]} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
  ) : (
    <svg className={`${iconClass[size]} translate-x-[1px]`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
  );

  return (
    <button
      type="button"
      onClick={() => toggle(track)}
      aria-label={showLabel ? undefined : name}
      aria-pressed={active}
      title={name}
      className={`mn-focus mn-stamp-press inline-flex shrink-0 items-center justify-center gap-2 rounded-full border-[1.5px] font-bold shadow-[var(--mn-shadow-stamp-sm)] transition ${
        status === "error"
          ? "border-[var(--mn-rose)] bg-[var(--mn-paper)] text-[var(--mn-rose)]"
          : active
            ? "border-[var(--mn-accent-deep)] bg-[var(--mn-accent)] text-white"
            : "border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-accent-deep)] hover:bg-[var(--mn-accent-soft)]"
      } ${showLabel ? "h-9 px-4 text-sm" : sizeClass[size]} ${className}`}
    >
      {icon}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}

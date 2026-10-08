import { useSyncExternalStore } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import type { SxProps, Theme } from "@mui/material/styles";
import ErrorIcon from "@mui/icons-material/Error";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
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

const buttonSize = { sm: 32, md: 40, lg: 48 } as const;
const iconSize = { sm: 14, md: 18, lg: 20 } as const;

/** Play/pause one track through the site-wide player; starting it stops whatever else was playing. */
export default function AudioPlayButton({ locale, track, size = "md", showLabel = false, className = "" }: AudioPlayButtonProps) {
  const status = useTrackStatus(track.id);
  const active = status === "playing" || status === "loading";
  const labelKey = status === "playing" ? "audio.pause" : status === "loading" ? "audio.loading" : status === "error" ? "audio.retry" : "audio.play";
  const label = t(locale, labelKey);
  const name = `${label}: ${track.title}`;
  const iconPx = iconSize[size];

  const icon = status === "loading" ? (
    <CircularProgress size={iconPx} thickness={5} color="inherit" aria-hidden="true" />
  ) : status === "playing" ? (
    <PauseIcon sx={{ fontSize: iconPx }} aria-hidden="true" />
  ) : status === "error" ? (
    <ErrorIcon sx={{ fontSize: iconPx }} aria-hidden="true" />
  ) : (
    <PlayArrowIcon sx={{ fontSize: iconPx }} aria-hidden="true" />
  );

  const stateSx: SxProps<Theme> = status === "error"
    ? { border: "1px solid", borderColor: "error.main", color: "error.main" }
    : active
      ? {
        bgcolor: "var(--md-sys-color-secondary-container)",
        color: "var(--md-sys-color-on-secondary-container)",
        "&:hover": { bgcolor: "var(--md-sys-color-secondary-container)" },
      }
      : {
        border: "1px solid var(--md-sys-color-outline-variant)",
        color: "var(--md-sys-color-primary)",
      };

  if (showLabel) {
    return (
      <MdMuiProvider>
        <Button
          variant="outlined"
          size="small"
          onClick={() => toggle(track)}
          aria-pressed={active}
          title={name}
          startIcon={icon}
          className={className}
          sx={{ borderRadius: 999, textTransform: "none", fontWeight: 700, ...stateSx }}
        >
          {label}
        </Button>
      </MdMuiProvider>
    );
  }

  return (
    <MdMuiProvider>
      <IconButton
        onClick={() => toggle(track)}
        aria-label={name}
        aria-pressed={active}
        title={name}
        className={className}
        sx={{ width: buttonSize[size], height: buttonSize[size], flexShrink: 0, ...stateSx }}
      >
        {icon}
      </IconButton>
    </MdMuiProvider>
  );
}

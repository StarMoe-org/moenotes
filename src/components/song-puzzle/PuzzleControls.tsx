"use client";

import Slider from "@mui/material/Slider";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { PuzzleOverlayMode } from "./PuzzleStage";

interface PuzzleControlsProps {
  locale: AppLocale;
  currentStep: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: number;
  overlayMode: PuzzleOverlayMode;
  onPlayPause: () => void;
  onReset: () => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  onJumpToGoal: () => void;
  onSeek: (step: number) => void;
  onSpeedChange: (speed: number) => void;
  onOverlayModeChange: (mode: PuzzleOverlayMode) => void;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

export default function PuzzleControls({
  locale,
  currentStep,
  totalSteps,
  isPlaying,
  speed,
  overlayMode,
  onPlayPause,
  onReset,
  onPrevStep,
  onNextStep,
  onJumpToGoal,
  onSeek,
  onSpeedChange,
  onOverlayModeChange,
}: PuzzleControlsProps) {
  const isAtStart = currentStep <= 0;
  const isAtEnd = currentStep >= totalSteps;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-4 shadow-sm md:p-5">
      {/* Step scrubber slider */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-body-medium">
          <span className="font-medium text-on-surface">
            {t(locale, "songPuzzle.stepProgress")}
          </span>
          <span className="font-mono text-label-large text-on-surface-variant">
            <strong className="text-primary">{currentStep}</strong> / {totalSteps}
          </span>
        </div>
        <Slider
          value={currentStep}
          min={0}
          max={Math.max(1, totalSteps)}
          step={1}
          disabled={totalSteps <= 0}
          onChange={(_, val) => {
            if (typeof val === "number") onSeek(val);
          }}
          aria-label={t(locale, "songPuzzle.stepProgress")}
          sx={{
            color: "var(--md-sys-color-primary)",
            "& .MuiSlider-thumb": {
              width: 18,
              height: 18,
              "&:hover, &.Mui-focusVisible": {
                boxShadow: "0 0 0 8px var(--md-sys-color-primary-container)",
              },
            },
          }}
        />
      </div>

      {/* Main playback control bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-outline-variant/40 py-2">
        <div className="flex items-center gap-1">
          {/* Reset */}
          <IconButton
            onClick={onReset}
            disabled={isAtStart}
            title={t(locale, "songPuzzle.reset")}
            aria-label={t(locale, "songPuzzle.reset")}
            size="small"
            sx={{ color: "var(--md-sys-color-on-surface-variant)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 20 9 12l10-8v16zM5 19V5" />
            </svg>
          </IconButton>

          {/* Previous Step */}
          <IconButton
            onClick={onPrevStep}
            disabled={isAtStart}
            title={t(locale, "songPuzzle.prevStep")}
            aria-label={t(locale, "songPuzzle.prevStep")}
            size="small"
            sx={{ color: "var(--md-sys-color-on-surface-variant)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </IconButton>

          {/* Play / Pause Primary Button */}
          <Button
            variant="contained"
            onClick={onPlayPause}
            disabled={totalSteps <= 0}
            aria-label={isPlaying ? t(locale, "songPuzzle.pause") : t(locale, "songPuzzle.play")}
            sx={{
              borderRadius: "9999px",
              minWidth: 96,
              height: 40,
              textTransform: "none",
              backgroundColor: "var(--md-sys-color-primary)",
              color: "var(--md-sys-color-on-primary)",
              "&:hover": {
                backgroundColor: "var(--md-sys-color-primary)",
                filter: "brightness(0.92)",
              },
            }}
          >
            {isPlaying ? (
              <span className="flex items-center gap-1.5 font-medium">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                {t(locale, "songPuzzle.pause")}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {t(locale, "songPuzzle.play")}
              </span>
            )}
          </Button>

          {/* Next Step */}
          <IconButton
            onClick={onNextStep}
            disabled={isAtEnd}
            title={t(locale, "songPuzzle.nextStep")}
            aria-label={t(locale, "songPuzzle.nextStep")}
            size="small"
            sx={{ color: "var(--md-sys-color-on-surface-variant)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </IconButton>

          {/* Jump to End */}
          <IconButton
            onClick={onJumpToGoal}
            disabled={isAtEnd}
            title={t(locale, "songPuzzle.jumpToEnd")}
            aria-label={t(locale, "songPuzzle.jumpToEnd")}
            size="small"
            sx={{ color: "var(--md-sys-color-on-surface-variant)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m5 4 10 8-10 8V4zM19 5v14" />
            </svg>
          </IconButton>
        </div>

        {/* Speed selectors */}
        <div className="flex items-center gap-1 rounded-full border border-outline-variant/60 bg-surface-container p-1">
          {SPEEDS.map((s) => (
            <button
              key={`speed-${s}`}
              type="button"
              onClick={() => onSpeedChange(s)}
              className={`rounded-full px-2 py-0.5 text-label-small font-medium transition-colors ${
                speed === s
                  ? "bg-primary text-on-primary shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Overlay Display Mode Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-body-small">
        <span className="text-on-surface-variant font-medium">
          {t(locale, "songPuzzle.displayMode")}:
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOverlayModeChange("picture")}
            className={`rounded-lg px-2.5 py-1 text-label-small font-medium transition-colors ${
              overlayMode === "picture"
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {t(locale, "songPuzzle.modePicture")}
          </button>
          <button
            type="button"
            onClick={() => onOverlayModeChange("numbered")}
            className={`rounded-lg px-2.5 py-1 text-label-small font-medium transition-colors ${
              overlayMode === "numbered"
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {t(locale, "songPuzzle.modeNumbered")}
          </button>
          <button
            type="button"
            onClick={() => onOverlayModeChange("numbersOnly")}
            className={`rounded-lg px-2.5 py-1 text-label-small font-medium transition-colors ${
              overlayMode === "numbersOnly"
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {t(locale, "songPuzzle.modeNumbersOnly")}
          </button>
        </div>
      </div>
    </div>
  );
}

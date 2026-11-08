"use client";

import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getTileDirection, getTileDisplayNumber } from "@/lib/song-puzzle/math";
import type { SlidePuzzleStep } from "@/lib/song-puzzle/types";

interface PuzzleStepListProps {
  locale: AppLocale;
  grid: number;
  steps: readonly SlidePuzzleStep[];
  currentStep: number;
  isPlaying: boolean;
  onSelectStep: (step: number) => void;
}

export default function PuzzleStepList({
  locale,
  grid,
  steps,
  currentStep,
  isPlaying,
  onSelectStep,
}: PuzzleStepListProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll strictly within listContainerRef without scrolling the parent window
  useEffect(() => {
    const container = listContainerRef.current;
    const item = activeItemRef.current;
    if (!container || !item) return;

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;

    if (itemTop < containerTop) {
      container.scrollTo({ top: itemTop, behavior: isPlaying ? "auto" : "smooth" });
    } else if (itemBottom > containerBottom) {
      container.scrollTo({
        top: itemBottom - container.clientHeight,
        behavior: isPlaying ? "auto" : "smooth",
      });
    }
  }, [currentStep, isPlaying]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = () => {
    if (steps.length === 0) return;
    const textLines = steps.map((s) => {
      const { arrow } = getTileDirection(s);
      const displayNum = getTileDisplayNumber(s.tile, grid);
      return `${s.index}. #${displayNum} ${arrow}`;
    });

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(textLines.join(" "))
        .then(() => {
          setCopied(true);
          if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
          copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {});
    }
  };

  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-4 shadow-sm md:p-5">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-title-small text-on-surface">
            {t(locale, "songPuzzle.textSteps")}
          </span>
          <span className="rounded-full bg-surface-container px-2 py-0.5 font-mono text-label-small text-on-surface-variant">
            {steps.length} {t(locale, "songPuzzle.stepsUnit")}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-label-small font-medium text-primary hover:bg-primary-container/40 transition-colors"
          title={t(locale, "songPuzzle.copySteps")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copied ? t(locale, "songPuzzle.stepsCopied") : t(locale, "songPuzzle.copySteps")}
        </button>
      </div>

      {/* Scrollable Step Items Container */}
      <div
        ref={listContainerRef}
        className="flex max-h-52 flex-col gap-1 overflow-y-auto pr-1 text-body-small select-none rounded-xl border border-outline-variant/30 bg-surface-container/30 p-1.5"
      >
        {/* Step 0 (Initial start state) */}
        <button
          type="button"
          ref={currentStep === 0 ? activeItemRef : null}
          onClick={() => onSelectStep(0)}
          className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors ${
            currentStep === 0
              ? "bg-primary text-on-primary font-bold shadow-xs"
              : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          }`}
        >
          <span className="font-mono text-label-small">#0</span>
          <span>{t(locale, "songPuzzle.stepInitial")}</span>
        </button>

        {steps.map((step) => {
          const isActive = currentStep === step.index;
          const { arrow, dirKey } = getTileDirection(step);
          const displayNumber = getTileDisplayNumber(step.tile, grid);

          return (
            <button
              key={`step-row-${step.index}`}
              type="button"
              ref={isActive ? activeItemRef : null}
              onClick={() => onSelectStep(step.index)}
              className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors ${
                isActive
                  ? "bg-primary text-on-primary font-bold shadow-xs"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-label-small min-w-[2.2rem]">
                  #{step.index}
                </span>
                <span className="font-medium">
                  {t(locale, "songPuzzle.stepAction", {
                    tile: displayNumber,
                    dir: `${arrow} ${t(locale, dirKey)}`,
                  })}
                </span>
              </div>

              <span
                className={`font-mono text-title-small font-bold px-1.5 rounded ${
                  isActive ? "bg-on-primary/20 text-on-primary" : "text-primary"
                }`}
              >
                {arrow}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

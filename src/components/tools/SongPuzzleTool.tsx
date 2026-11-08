"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { PRIMARY_SERVER } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { moveReleaseUrls } from "@/lib/assets/release";
import { replaceUrl } from "@/lib/browser/history";
import { getBandSmallIconUrl } from "@/lib/cards/assets";
import type { MusicViewModel } from "@/lib/music/data";
import { getRoutePathById } from "@/lib/route/registry";
import { entityServer, type ServerFaceted } from "@/lib/servers/facets";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";
import MusicSelectDialog from "@/components/music/MusicSelectDialog";
import SpoilerNotice from "@/components/shared/SpoilerNotice";
import PuzzleStage, { type PuzzleOverlayMode } from "@/components/song-puzzle/PuzzleStage";
import PuzzleControls from "@/components/song-puzzle/PuzzleControls";
import PuzzleMetaCard from "@/components/song-puzzle/PuzzleMetaCard";
import PuzzleStepList from "@/components/song-puzzle/PuzzleStepList";
import { fetchPuzzleIndex, fetchPuzzleSolution } from "@/lib/song-puzzle/client";
import { getBoardAtStep, isPuzzleSolved } from "@/lib/song-puzzle/math";
import type { SlidePuzzleIndexItem, SlidePuzzleSolution } from "@/lib/song-puzzle/types";

interface Props {
  locale: AppLocale;
  songs: ServerFaceted<MusicViewModel>[];
}

const SPEED_TO_DURATION: Record<number, number> = {
  0.5: 500,
  1: 320,
  2: 160,
  4: 80,
};

export default function SongPuzzleTool({ locale, songs: allSongs }: Props) {
  const songs = useMemo(
    () => allSongs.map((song) => moveReleaseUrls(song, entityServer(song, PRIMARY_SERVER))),
    [allSongs],
  );

  const [puzzleIndex, setPuzzleIndex] = useState<SlidePuzzleIndexItem[]>([]);
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [selectedMusicId, setSelectedMusicId] = useState<number | null>(null);
  const [selectedGrid, setSelectedGrid] = useState<number>(3);
  const [solution, setSolution] = useState<SlidePuzzleSolution | null>(null);
  const [loadingSolution, setLoadingSolution] = useState<boolean>(false);

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [overlayMode, setOverlayMode] = useState<PuzzleOverlayMode>("numbered");
  const [skipTransition, setSkipTransition] = useState<boolean>(false);

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [restoredFromUrl, setRestoredFromUrl] = useState<boolean>(false);

  const { showSpoiler, now } = useSpoilerSetting();
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load index.jsonl on mount
  useEffect(() => {
    let active = true;
    fetchPuzzleIndex()
      .then((items) => {
        if (!active) return;
        setPuzzleIndex(items);
        setIndexLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setIndexLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Available music IDs from puzzle index
  const availableMusicIds = useMemo(() => new Set(puzzleIndex.map((item) => item.musicId)), [puzzleIndex]);

  // Songs that have puzzle solutions
  const availableSongs = useMemo(() => {
    return songs.filter((s) => availableMusicIds.has(s.id));
  }, [songs, availableMusicIds]);

  // Read URL query params on initial mount after index is loaded
  useEffect(() => {
    if (!indexLoaded || restoredFromUrl) return;

    const params = new URLSearchParams(window.location.search);
    const musicParam = params.get("music");
    const gridParam = params.get("grid");
    const stepParam = params.get("step");

    let initialMusicId: number | null = null;
    if (musicParam) {
      const parsed = parseInt(musicParam, 10);
      if (availableMusicIds.has(parsed)) initialMusicId = parsed;
    }
    if (initialMusicId === null && availableSongs.length > 0) {
      initialMusicId = availableSongs[0]?.id ?? null;
    }

    let initialGrid = 3;
    if (gridParam) {
      const parsedG = parseInt(gridParam, 10);
      if (parsedG >= 3 && parsedG <= 8) initialGrid = parsedG;
    }

    let initialStep = 0;
    if (stepParam) {
      const parsedS = parseInt(stepParam, 10);
      if (!isNaN(parsedS) && parsedS >= 0) initialStep = parsedS;
    }

    setSelectedMusicId(initialMusicId);
    setSelectedGrid(initialGrid);
    setCurrentStep(initialStep);
    setRestoredFromUrl(true);
  }, [indexLoaded, availableMusicIds, availableSongs, restoredFromUrl]);

  // Available grids for current musicId
  const availableGridsForSelected = useMemo(() => {
    if (!selectedMusicId) return [];
    return puzzleIndex
      .filter((item) => item.musicId === selectedMusicId)
      .map((item) => item.grid)
      .sort((a, b) => a - b);
  }, [puzzleIndex, selectedMusicId]);

  // Fetch solution when (musicId, grid) changes
  useEffect(() => {
    if (!selectedMusicId || !selectedGrid) return;
    let active = true;
    setLoadingSolution(true);
    setIsPlaying(false);

    fetchPuzzleSolution(selectedMusicId, selectedGrid).then((sol) => {
      if (!active) return;
      setSolution(sol);
      setLoadingSolution(false);
      setCurrentStep((prev) => {
        if (!sol) return 0;
        return Math.min(prev, sol.steps.length);
      });
    });

    return () => {
      active = false;
    };
  }, [selectedMusicId, selectedGrid]);

  // Sync state to URL
  useEffect(() => {
    if (!restoredFromUrl || !selectedMusicId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("music", String(selectedMusicId));
    url.searchParams.set("grid", String(selectedGrid));
    if (currentStep > 0) {
      url.searchParams.set("step", String(currentStep));
    } else {
      url.searchParams.delete("step");
    }
    replaceUrl(`${url.pathname}${url.search}`);
  }, [restoredFromUrl, selectedMusicId, selectedGrid, currentStep]);

  // Autoplay ticker
  useEffect(() => {
    if (!isPlaying || !solution) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const intervalMs = SPEED_TO_DURATION[speed] ?? 320;
    playTimerRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= solution.steps.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, solution, speed]);

  const selectedSong = useMemo(
    () => songs.find((s) => s.id === selectedMusicId) ?? null,
    [songs, selectedMusicId],
  );

  const currentIndexItem = useMemo(() => {
    return (
      puzzleIndex.find(
        (item) => item.musicId === selectedMusicId && item.grid === selectedGrid,
      ) ?? null
    );
  }, [puzzleIndex, selectedMusicId, selectedGrid]);

  const totalSteps = solution?.steps.length ?? 0;

  // Board state calculation
  const currentBoard = useMemo(() => {
    if (!solution) return [];
    return getBoardAtStep(solution, currentStep);
  }, [solution, currentStep]);

  const isSolved = useMemo(() => {
    if (!solution || currentBoard.length === 0) return false;
    return isPuzzleSolved(currentBoard, solution.meta.goal);
  }, [solution, currentBoard]);

  const lastStep = useMemo(() => {
    if (!solution || currentStep <= 0) return null;
    return solution.steps[currentStep - 1] ?? null;
  }, [solution, currentStep]);

  // Controls callbacks
  const handlePlayPause = useCallback(() => {
    if (currentStep >= totalSteps) {
      // Loop from start
      setCurrentStep(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  }, [currentStep, totalSteps]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setSkipTransition(true);
    setCurrentStep(0);
    requestAnimationFrame(() => setSkipTransition(false));
  }, []);

  const handlePrevStep = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextStep = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.min(totalSteps, prev + 1));
  }, [totalSteps]);

  const handleJumpToGoal = useCallback(() => {
    setIsPlaying(false);
    setSkipTransition(true);
    setCurrentStep(totalSteps);
    requestAnimationFrame(() => setSkipTransition(false));
  }, [totalSteps]);

  const handleSeek = useCallback(
    (step: number) => {
      setIsPlaying(false);
      setSkipTransition(true);
      setCurrentStep(step);
      requestAnimationFrame(() => setSkipTransition(false));
    },
    [],
  );

  const isUnreleased = Boolean(selectedSong?.startAt && isSpoiler(selectedSong.startAt, now));

  if (!showSpoiler && isUnreleased) {
    return (
      <div className="space-y-5">
        <SpoilerNotice locale={locale} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Selected Song Info & Picker Trigger */}
      {selectedSong && (
        <div className="md3-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center justify-between lg:p-5 rounded-2xl border border-outline-variant/60">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <img
              className="h-16 w-16 shrink-0 rounded-xl border border-outline-variant bg-surface-container-highest object-cover shadow-xs"
              src={selectedSong.jacketUrl}
              alt=""
            />
            <div className="min-w-0">
              <a
                href={localizePath(`${getRoutePathById("music")}/${selectedSong.id}`, locale)}
                className="block truncate font-bold text-title-large text-on-surface hover:text-primary transition-colors sm:text-headline-small"
              >
                {selectedSong.title}
              </a>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-label-medium text-on-surface-variant">
                <img
                  className="h-4 w-auto shrink-0 object-contain"
                  src={getBandSmallIconUrl(selectedSong.bandId)}
                  alt=""
                  aria-hidden="true"
                />
                <span className="truncate">{selectedSong.bandName}</span>
              </div>
            </div>
          </div>

          <Button
            variant="outlined"
            onClick={() => setDialogOpen(true)}
            sx={{
              borderRadius: "9999px",
              borderColor: "var(--md-sys-color-outline-variant)",
              color: "var(--md-sys-color-primary)",
              textTransform: "none",
            }}
          >
            {t(locale, "songPuzzle.changeSong")}
          </Button>
        </div>
      )}

      {/* Main Interactive Stage Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Puzzle Board Canvas */}
        <div className="lg:col-span-7 flex flex-col items-center">
          {selectedSong && solution && currentBoard.length > 0 ? (
            <PuzzleStage
              jacketUrl={selectedSong.jacketUrl}
              grid={selectedGrid}
              board={currentBoard}
              goal={solution.meta.goal}
              isSolved={isSolved}
              overlayMode={overlayMode}
              stepTransitionDurationMs={SPEED_TO_DURATION[speed] ?? 320}
              skipTransition={skipTransition}
              lastStep={lastStep}
            />
          ) : (
            <div className="flex aspect-square w-full max-w-[500px] items-center justify-center rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest text-on-surface-variant">
              {loadingSolution ? t(locale, "songPuzzle.loading") : t(locale, "songPuzzle.emptySelection")}
            </div>
          )}
        </div>

        {/* Right column: Info & Controls */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <PuzzleMetaCard
            locale={locale}
            currentGrid={selectedGrid}
            availableGrids={availableGridsForSelected}
            meta={solution?.meta ?? null}
            indexItem={currentIndexItem}
            onGridChange={(g) => {
              setSelectedGrid(g);
              setCurrentStep(0);
              setIsPlaying(false);
            }}
          />

          <PuzzleControls
            locale={locale}
            currentStep={currentStep}
            totalSteps={totalSteps}
            isPlaying={isPlaying}
            speed={speed}
            overlayMode={overlayMode}
            onPlayPause={handlePlayPause}
            onReset={handleReset}
            onPrevStep={handlePrevStep}
            onNextStep={handleNextStep}
            onJumpToGoal={handleJumpToGoal}
            onSeek={handleSeek}
            onSpeedChange={setSpeed}
            onOverlayModeChange={setOverlayMode}
          />

          {solution && solution.steps.length > 0 && (
            <PuzzleStepList
              locale={locale}
              steps={solution.steps}
              currentStep={currentStep}
              onSelectStep={handleSeek}
            />
          )}
        </div>
      </div>

      {/* Song selection dialog */}
      <MusicSelectDialog
        locale={locale}
        songs={availableSongs}
        open={dialogOpen}
        songOnly
        onClose={() => setDialogOpen(false)}
        onSelect={(selection) => {
          setSelectedMusicId(selection.song.id);
          setCurrentStep(0);
          setIsPlaying(false);
          setDialogOpen(false);
        }}
        current={selectedMusicId ? { musicId: selectedMusicId, difficulty: "expert" } : null}
        title={t(locale, "songPuzzle.chooseSong")}
      />
    </div>
  );
}

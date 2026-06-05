import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipBack, SkipForward, Volume2, Music2, X } from "lucide-react";
import { getBand } from "../data/bands";

const PLAYLIST = [
  { band: "mygo", title: "春日影", album: "MyGO!!!!!" },
  { band: "mujica", title: "顔", album: "Ave Mujica" },
  { band: "mewtype", title: "無限大", album: "夢限大みゅーたいぷ" },
  { band: "millsage", title: "しあわせのおと", album: "millsage" },
  { band: "ikka", title: "家族讃歌", album: "一家Dumb Rock!" },
];

export default function PlayerBar() {
  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const current = PLAYLIST[idx];
  const band = getBand(current.band as any);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
          className="fixed bottom-4 right-4 z-40 max-w-[360px] w-[calc(100vw-2rem)] sm:w-[360px]"
        >
          <div
            className="relative border-[2.5px] border-[var(--color-ink)] rounded-lg overflow-hidden shadow-[var(--shadow-stamp-lg)]"
            style={{ background: `linear-gradient(135deg, ${band.color} 0%, ${band.accent} 100%)` }}
          >
            <div className="absolute inset-0 stripes-cream opacity-25" />
            <div className="absolute inset-0 halftone opacity-15 text-white" />

            <button
              onClick={() => setOpen(false)}
              className="absolute top-2 right-2 z-10 w-7 h-7 grid place-items-center bg-[var(--color-ink)] text-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded-full hover:bg-[var(--color-tomato)]"
              aria-label="关闭播放器"
            >
              <X size={14} />
            </button>

            <div className="relative p-4 text-[var(--color-cream)]">
              {/* Top label */}
              <div className="flex items-center gap-1.5 text-[10px] font-[var(--font-display)] tracking-widest opacity-80 mb-3">
                <Music2 size={11} /> NOW PLAYING
              </div>

              {/* Disc + info */}
              <div className="flex items-center gap-3 mb-3">
                <motion.div
                  animate={{ rotate: playing ? 360 : 0 }}
                  transition={{ duration: 4, repeat: playing ? Infinity : 0, ease: "linear" }}
                  className="shrink-0 w-16 h-16 rounded-full border-[3px] border-[var(--color-cream)] grid place-items-center relative"
                  style={{ background: `linear-gradient(135deg, ${band.color}, ${band.accent})` }}
                >
                  <div className="w-5 h-5 rounded-full bg-[var(--color-ink)] border-2 border-[var(--color-cream)]" />
                  <div className="absolute inset-0 rounded-full halftone opacity-30 text-white" />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <div className="font-[var(--font-jp)] font-bold text-base sm:text-lg leading-tight truncate">
                    {current.title}
                  </div>
                  <div className="text-xs opacity-90 font-[var(--font-jp)] truncate">
                    {band.name}
                  </div>
                </div>
              </div>

              {/* Waveform-ish progress bar */}
              <div className="h-1 bg-[var(--color-cream)]/20 rounded-full overflow-hidden mb-2">
                <motion.div
                  className="h-full bg-[var(--color-cream)]"
                  animate={{ width: playing ? ["0%", "100%"] : "12%" }}
                  transition={{ duration: playing ? 16 : 0, repeat: playing ? Infinity : 0, ease: "linear" }}
                />
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-2 mt-2">
                <button
                  onClick={() => setIdx((idx - 1 + PLAYLIST.length) % PLAYLIST.length)}
                  className="w-9 h-9 grid place-items-center border-2 border-[var(--color-cream)] rounded-full hover:bg-[var(--color-cream)]/15"
                >
                  <SkipBack size={14} fill="currentColor" />
                </button>
                <button
                  onClick={() => setPlaying(!playing)}
                  className="w-12 h-12 grid place-items-center bg-[var(--color-cream)] text-[var(--color-ink)] border-[2.5px] border-[var(--color-ink)] rounded-full shadow-[var(--shadow-stamp-sm)] hover:scale-105 transition-transform"
                >
                  {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="translate-x-0.5" />}
                </button>
                <button
                  onClick={() => setIdx((idx + 1) % PLAYLIST.length)}
                  className="w-9 h-9 grid place-items-center border-2 border-[var(--color-cream)] rounded-full hover:bg-[var(--color-cream)]/15"
                >
                  <SkipForward size={14} fill="currentColor" />
                </button>
                <button className="w-8 h-8 grid place-items-center ml-1 opacity-70 hover:opacity-100">
                  <Volume2 size={14} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {!open && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 w-12 h-12 grid place-items-center bg-[var(--color-tomato)] text-[var(--color-cream)] border-[2.5px] border-[var(--color-ink)] rounded-full shadow-[var(--shadow-stamp)] hover:scale-110 transition-transform"
          aria-label="打开播放器"
        >
          <Music2 size={20} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

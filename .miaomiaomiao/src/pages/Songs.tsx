import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { bands, songs, getBand } from "../data/bands";
import { SectionTitle, FadeIn, Tag } from "../components/UI";
import { Play, Clock, Calendar, Search, Disc3 } from "lucide-react";
import { cn } from "../utils/cn";

const TYPES = ["全部", "原创", "翻唱", "印象曲", "角色曲"];

export default function Songs() {
  const [band, setBand] = useState("all");
  const [type, setType] = useState("全部");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    return songs.filter((s) => {
      if (band !== "all" && s.band !== band) return false;
      if (type !== "全部" && s.type !== type) return false;
      if (q && !s.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [band, type, q]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <SectionTitle
        eyebrow="Discography"
        title={<>歌曲库 .</>}
        subtitle={`收录 ${songs.length} 首 ── 原创 / 翻唱 / 印象曲 / 角色曲。`}
      />

      {/* Filters */}
      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索曲名…"
            className="w-full pl-10 pr-3 py-2.5 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md font-[var(--font-jp)] text-sm focus:outline-none focus:bg-[var(--color-cream)]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterBtn active={band === "all"} onClick={() => setBand("all")}>全部乐队</FilterBtn>
          {bands.map((b) => (
            <FilterBtn key={b.key} active={band === b.key} onClick={() => setBand(b.key)} activeBg={b.color}>
              {b.name}
            </FilterBtn>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <FilterBtn key={t} active={type === t} onClick={() => setType(t)}>
              {t}
            </FilterBtn>
          ))}
        </div>
      </div>

      <div className="text-sm text-[var(--color-ink-soft)] mb-4 font-[var(--font-jp)]">
        共 <span className="font-bold text-[var(--color-tomato)]">{list.length}</span> 首
      </div>

      {/* Songs */}
      <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
        {list.map((s, i) => {
          const b = getBand(s.band);
          return (
            <FadeIn key={s.id} delay={Math.min(i, 6) * 0.05}>
              <div
                className="group flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-stamp-sm)] hover:shadow-[var(--shadow-stamp)] transition-all"
                style={{ transform: `rotate(${i % 2 ? 0.7 : -0.7}deg)` }}
              >
                <div
                  className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 grid place-items-center border-[2.5px] border-[var(--color-ink)] rounded relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${b.color} 0%, ${b.accent} 100%)` }}
                >
                  <Disc3 size={32} className="text-[var(--color-cream)] opacity-90" />
                  <div className="absolute inset-0 halftone opacity-30 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <Tag color={b.color}>{b.name}</Tag>
                    <Tag>{s.type}</Tag>
                  </div>
                  <h3 className="font-[var(--font-display)] text-xl sm:text-2xl tracking-tight truncate">{s.title}</h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-soft)] mt-1.5 font-[var(--font-jp)]">
                    <span className="flex items-center gap-1"><Clock size={11} /> {s.duration}</span>
                    <span className="flex items-center gap-1"><Calendar size={11} /> {s.released}</span>
                  </div>
                </div>
                {s.hasMV && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    className="shrink-0 w-11 h-11 grid place-items-center border-2 border-[var(--color-ink)] rounded-full bg-[var(--color-tomato)] text-[var(--color-cream)] hover:scale-110 transition-transform"
                  >
                    <Play size={18} fill="currentColor" />
                  </motion.button>
                )}
              </div>
            </FadeIn>
          );
        })}
      </div>

      {/* Upcoming / TBA card */}
      <FadeIn delay={0.3}>
        <div className="mt-10 p-6 sm:p-8 border-[2.5px] border-dashed border-[var(--color-ink)] rounded-md text-center bg-[var(--color-paper)]/60">
          <div className="font-[var(--font-hand)] text-2xl text-[var(--color-tomato)]">coming soon…</div>
          <div className="font-[var(--font-display)] text-xl mt-1">更多曲目整理中</div>
          <div className="text-sm text-[var(--color-ink-soft)] font-[var(--font-jp)] mt-1">
            我们会持续跟进官方发行,第一时间更新数据。
          </div>
        </div>
      </FadeIn>
    </div>
  );
}

function FilterBtn({
  children, active, onClick, activeBg = "var(--color-ink)",
}: { children: React.ReactNode; active: boolean; onClick: () => void; activeBg?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 border-[2px] border-[var(--color-ink)] rounded-full text-xs sm:text-sm font-bold transition-all",
        active ? "text-[var(--color-cream)]" : "bg-[var(--color-cream)] hover:shadow-[2px_2px_0_0_var(--color-ink)]"
      )}
      style={{ background: active ? activeBg : undefined, transform: active ? "rotate(-1deg)" : "rotate(0.5deg)" }}
    >
      {children}
    </button>
  );
}

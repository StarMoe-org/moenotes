import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { characters, bands, getBand } from "../data/bands";
import { SectionTitle, FadeIn } from "../components/UI";
import { PlaceholderAvatar, PlaceholderArt, SparkleIcon, StarIcon } from "../components/Placeholders";
import { cn } from "../utils/cn";

export default function Characters() {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    return characters.filter((c) => {
      if (filter !== "all" && c.band !== filter) return false;
      if (q && !`${c.nameJa}${c.nameRomaji}${c.nameCn}${c.position}${c.cv}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [filter, q]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <SectionTitle
        eyebrow="Character Codex"
        title={<>25 名角色 .</>}
        subtitle="按乐队筛选,或搜索名字 / 担当 / 声优 ── 探索属于你的本命。"
      />

      {/* Filters */}
      <div className="mb-8 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索名字 / 担当 / 声优…"
            className="w-full pl-10 pr-3 py-2.5 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md font-[var(--font-jp)] text-sm focus:outline-none focus:bg-[var(--color-cream)] focus:shadow-[var(--shadow-stamp-sm)]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "px-3.5 py-2 border-[2.5px] border-[var(--color-ink)] rounded-full text-sm font-bold transition-all",
              filter === "all" ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "bg-[var(--color-cream)]"
            )}
            style={{ transform: filter === "all" ? "rotate(-1deg)" : "rotate(1deg)" }}
          >
            全部 ({characters.length})
          </button>
          {bands.map((b, i) => (
            <button
              key={b.key}
              onClick={() => setFilter(b.key)}
              className={cn(
                "px-3.5 py-2 border-[2.5px] border-[var(--color-ink)] rounded-full text-sm font-bold transition-all",
              )}
              style={{
                background: filter === b.key ? b.color : "var(--color-cream)",
                color: filter === b.key ? "var(--color-cream)" : "var(--color-ink)",
                transform: filter === b.key ? `rotate(-1deg)` : `rotate(${i % 2 ? 1 : -1}deg)`,
              }}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
        {list.map((c, i) => {
          const band = getBand(c.band);
          return (
            <FadeIn key={c.id} delay={Math.min(i, 12) * 0.03}>
              <Link to={`/characters/${c.id}`} className="group block">
                <motion.div
                  whileHover={{ y: -6, rotate: i % 2 ? 1 : -1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 18 }}
                  className="relative aspect-[3/4] rounded-md border-[2.5px] border-[var(--color-ink)] overflow-hidden shadow-[var(--shadow-card)]"
                  style={{ transform: `rotate(${i % 2 ? -1.5 : 1.5}deg)` }}
                >
                  <div className={cn("absolute inset-0 bg-gradient-to-br", c.bgGradient)} />
                  <div className="absolute inset-0 halftone opacity-20 text-white" />
                  <div className="absolute inset-0 stripes-cream opacity-30" />

                  {/* Emoji art */}
                  <div className="absolute inset-0 grid place-items-center text-[100px] sm:text-[120px]">
                    <PlaceholderAvatar id={c.id} label={c.nameJa} color={c.color} className="h-[1em] w-[1em] text-[1em]" />
                  </div>

                  {/* Position badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-[var(--color-cream)] border-2 border-[var(--color-ink)] text-xs font-bold rounded-sm">
                    {c.position}
                  </div>

                  {/* Band tag */}
                  <div
                    className="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold text-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded-sm"
                    style={{ background: band.color }}
                  >
                    {band.name.split(" ")[0]}
                  </div>

                  {/* Bottom info */}
                  <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-[var(--color-cream)] border-t-[2.5px] border-[var(--color-ink)]">
                    <div className="font-[var(--font-jp)] font-bold text-sm truncate">{c.nameJa}</div>
                    <div className="font-[var(--font-hand)] text-xs text-[var(--color-cocoa)] truncate">
                      {c.nameCn}
                    </div>
                  </div>
                </motion.div>
              </Link>
            </FadeIn>
          );
        })}
      </div>

      {list.length === 0 && (
        <div className="py-20 text-center">
          <div className="font-[var(--font-hand)] text-3xl text-[var(--color-cocoa)]">没有匹配的角色</div>
          <div className="text-sm text-[var(--color-ink-soft)] mt-2">试试换个搜索词</div>
        </div>
      )}
    </div>
  );
}



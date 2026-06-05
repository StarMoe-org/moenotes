import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { cards, getCharacter, bands } from "../data/bands";
import { SectionTitle, FadeIn, attributeColor, rarityBg } from "../components/UI";
import { Search, Star, Lock } from "lucide-react";
import { cn } from "../utils/cn";

const RARITIES = [5, 4, 3, 2, 1] as const;
const ATTRS = ["Power", "Cool", "Pure", "Happy", "Dark"] as const;

export default function Cards() {
  const [rarity, setRarity] = useState<number | "all">("all");
  const [attr, setAttr] = useState<string>("all");
  const [band, setBand] = useState<string>("all");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    return cards.filter((c) => {
      if (rarity !== "all" && c.rarity !== rarity) return false;
      if (attr !== "all" && c.attribute !== attr) return false;
      const ch = getCharacter(c.characterId);
      if (band !== "all" && ch.band !== band) return false;
      if (q && !`${c.name}${c.skill}${ch.nameJa}${ch.nameCn}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [rarity, attr, band, q]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <SectionTitle
        eyebrow="Card Codex"
        title={<>卡牌图鉴 .</>}
        subtitle={`收录 ${cards.length} 张卡牌 ── 按稀有度 / 属性 / 乐队筛选。点击查看详细数据。`}
      />

      {/* Filters */}
      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索卡名 / 技能 / 角色…"
            className="w-full pl-10 pr-3 py-2.5 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md font-[var(--font-jp)] text-sm focus:outline-none focus:bg-[var(--color-cream)]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterBtn active={rarity === "all"} onClick={() => setRarity("all")}>全部稀有度</FilterBtn>
          {RARITIES.map((r) => (
            <FilterBtn key={r} active={rarity === r} onClick={() => setRarity(r)}>
              <span className="flex items-center gap-1">{r}★</span>
            </FilterBtn>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterBtn active={attr === "all"} onClick={() => setAttr("all")}>全部属性</FilterBtn>
          {ATTRS.map((a) => (
            <FilterBtn
              key={a}
              active={attr === a}
              onClick={() => setAttr(a)}
              activeBg={attributeColor(a)}
            >
              {a}
            </FilterBtn>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterBtn active={band === "all"} onClick={() => setBand("all")}>全部乐队</FilterBtn>
          {bands.map((b) => (
            <FilterBtn
              key={b.key}
              active={band === b.key}
              onClick={() => setBand(b.key)}
              activeBg={b.color}
            >
              {b.name}
            </FilterBtn>
          ))}
        </div>
      </div>

      <div className="text-sm text-[var(--color-ink-soft)] mb-4 font-[var(--font-jp)]">
        共 <span className="font-bold text-[var(--color-tomato)]">{list.length}</span> 张卡牌
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
        {list.map((c, i) => {
          const ch = getCharacter(c.characterId);
          const isHigh = c.rarity >= 4;
          return (
            <FadeIn key={c.id} delay={Math.min(i, 8) * 0.04}>
              <motion.div
                whileHover={{ y: -6, rotate: isHigh ? -2 : 2 }}
                transition={{ type: "spring", stiffness: 280 }}
                className={cn(
                  "group relative aspect-[2/3] rounded-md border-[2.5px] border-[var(--color-ink)] overflow-hidden shadow-[var(--shadow-card)]",
                  isHigh && "ring-1 ring-[var(--color-ink)]"
                )}
                style={{ transform: `rotate(${i % 2 ? -1 : 1}deg)` }}
              >
                {/* Card BG */}
                <div className="absolute inset-0" style={{ background: rarityBg(c.rarity) }} />
                <div className="absolute inset-0 halftone opacity-30 text-white" />
                <div className="absolute inset-0 stripes-cream opacity-15" />

                {/* Top-left: stars */}
                <div className="absolute top-2 left-2 flex items-center gap-0.5">
                  {Array.from({ length: c.rarity }).map((_, j) => (
                    <Star key={j} size={12} fill="currentColor" className="text-[var(--color-cream)]" />
                  ))}
                </div>

                {/* Top-right: attribute */}
                <div
                  className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold text-[var(--color-cream)] border border-[var(--color-cream)] rounded-sm"
                  style={{ background: attributeColor(c.attribute) }}
                >
                  {c.attribute}
                </div>

                {/* Big emoji art */}
                <div className="absolute inset-x-0 top-1/4 bottom-1/3 grid place-items-center text-[80px] sm:text-[100px]">
                  {c.art}
                </div>

                {/* Card name */}
                <div className="absolute bottom-[42%] left-0 right-0 text-center px-2">
                  <div className="font-[var(--font-jp)] font-bold text-xs sm:text-sm text-[var(--color-cream)] text-shadow leading-tight line-clamp-2" style={{ textShadow: "0 1px 2px rgba(0,0,0,.5)" }}>
                    {c.name}
                  </div>
                </div>

                {/* Skill box */}
                <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-[var(--color-cream)] border-t-[2.5px] border-[var(--color-ink)]">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-7 h-7 rounded-full border-2 border-[var(--color-ink)] grid place-items-center text-xs shrink-0"
                      style={{ background: ch.color, color: "var(--color-cream)" }}
                    >
                      {ch.nameJa.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-[var(--font-jp)] font-bold text-[11px] truncate">{ch.nameJa}</div>
                      <div className="font-[var(--font-hand)] text-[10px] text-[var(--color-cocoa)] -mt-0.5 truncate">{c.gacha}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-[var(--color-ink-soft)] line-clamp-1">
                    <span className="font-bold">{c.skill.split(" / ")[0]}</span>
                  </div>
                </div>
              </motion.div>
            </FadeIn>
          );
        })}
      </div>

      {list.length === 0 && (
        <div className="py-20 text-center">
          <div className="font-[var(--font-hand)] text-3xl text-[var(--color-cocoa)]">没有匹配的卡牌</div>
        </div>
      )}

      {/* Under construction card */}
      <FadeIn delay={0.2}>
        <div className="mt-12 p-6 sm:p-8 border-[2.5px] border-dashed border-[var(--color-ink)] rounded-md text-center bg-[var(--color-paper)]/50">
          <Lock size={28} className="mx-auto text-[var(--color-ink-soft)]" />
          <div className="font-[var(--font-display)] text-xl mt-2">更多卡牌数据整理中…</div>
          <div className="text-sm text-[var(--color-ink-soft)] font-[var(--font-jp)] mt-1">
            当前已收录 {cards.length} 张, 目标 200+ 张。 欢迎投稿数据 →
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
      style={{
        background: active ? activeBg : undefined,
        transform: active ? "rotate(-1deg)" : "rotate(0.5deg)",
      }}
    >
      {children}
    </button>
  );
}

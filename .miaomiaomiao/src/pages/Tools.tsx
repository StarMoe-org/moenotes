import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { characters, cards } from "../data/bands";
import { SectionTitle, attributeColor, rarityBg } from "../components/UI";
import { Dices, RefreshCw, Calculator } from "lucide-react";
import { cn } from "../utils/cn";

export default function Tools() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <SectionTitle
        eyebrow="Player Tools"
        title={<>实用工具 .</>}
        subtitle="由玩家为玩家而做 ── 抽卡模拟、属性计算等, 持续添加中。"
      />
      <div className="grid lg:grid-cols-2 gap-6">
        <GachaSim />
        <RosterCounter />
      </div>
    </div>
  );
}

// =====================================
// 1. GACHA SIMULATOR
// =====================================
function GachaSim() {
  const [history, setHistory] = useState<typeof cards>([]);
  const [pity, setPity] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [pulls, setPulls] = useState(1);

  const roll = () => {
    if (rolling) return;
    setRolling(true);
    const newPulls: typeof cards = [];
    const newPity = pity;
    for (let i = 0; i < pulls; i++) {
      const isPity = newPity + i >= 50;
      const is4Plus = isPity || Math.random() < 0.06 || (i === pulls - 1 && Math.random() < 0.4);
      const pool = cards.filter((c) => is4Plus ? c.rarity >= 4 : c.rarity <= 3);
      const c = pool[Math.floor(Math.random() * pool.length)];
      newPulls.push(c);
    }
    setHistory([...newPulls, ...history].slice(0, 30));
    setPity((pity + pulls) % 50);
    setTimeout(() => setRolling(false), 500);
  };

  const reset = () => { setHistory([]); setPity(0); };

  return (
    <div className="p-5 sm:p-7 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 grid place-items-center bg-[var(--color-tomato)] text-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded">
            <Dices size={20} />
          </div>
          <div>
            <h3 className="font-[var(--font-display)] text-xl">GACHA SIM</h3>
            <div className="text-xs text-[var(--color-ink-soft)]">抽卡模拟器 · 仅供娱乐</div>
          </div>
        </div>
        <button onClick={reset} className="p-2 border-2 border-[var(--color-ink)] rounded hover:bg-[var(--color-ink)] hover:text-[var(--color-cream)]" title="重置">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[1, 10, 30].map((n) => (
          <button
            key={n}
            onClick={() => setPulls(n)}
            className={cn(
              "py-2 border-[2.5px] border-[var(--color-ink)] rounded font-[var(--font-display)] text-sm transition-all",
              pulls === n ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "bg-[var(--color-cream)]"
            )}
            style={{ transform: pulls === n ? "rotate(-1deg)" : "rotate(0.5deg)" }}
          >
            {n} 连
          </button>
        ))}
      </div>

      <button
        onClick={roll}
        disabled={rolling}
        className="w-full py-3 bg-[var(--color-tomato)] text-[var(--color-cream)] border-[2.5px] border-[var(--color-ink)] rounded-md font-[var(--font-display)] tracking-wider shadow-[var(--shadow-stamp)] hover:shadow-[var(--shadow-stamp-sm)] hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-50"
      >
        {rolling ? "ROLLING…" : `PULL × ${pulls}`}
      </button>

      <div className="mt-3 text-xs text-[var(--color-ink-soft)] font-[var(--font-jp)] flex items-center justify-between">
        <span>天井保底: {pity} / 50</span>
        <span>历史: {history.length} 张</span>
      </div>
      <div className="mt-1.5 h-1.5 bg-[var(--color-cream-deep)] rounded-full overflow-hidden border border-[var(--color-ink)]">
        <div className="h-full bg-[var(--color-tomato)] transition-all" style={{ width: `${(pity / 50) * 100}%` }} />
      </div>

      <div className="mt-4 max-h-72 overflow-y-auto pr-1 space-y-2">
        <AnimatePresence>
          {history.slice(0, 10).map((c, i) => {
            const ch = characters.find((x) => x.id === c.characterId)!;
            return (
              <motion.div
                key={`${c.id}-${i}-${history.length}`}
                initial={{ x: 30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="flex items-center gap-2 p-2 border-2 border-[var(--color-ink)] rounded bg-[var(--color-cream)]"
              >
                <div
                  className="w-10 h-10 grid place-items-center text-lg border-2 border-[var(--color-ink)] rounded shrink-0"
                  style={{ background: rarityBg(c.rarity) }}
                >
                  {c.art}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-[var(--font-jp)] font-bold text-sm truncate">{c.name}</div>
                  <div className="text-[10px] text-[var(--color-ink-soft)] truncate">
                    {c.rarity}★ · {ch.nameJa} · {c.attribute}
                  </div>
                </div>
                <span
                  className="px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-cream)] border border-[var(--color-ink)] rounded-sm"
                  style={{ background: attributeColor(c.attribute) }}
                >
                  {c.attribute[0]}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {history.length === 0 && (
          <div className="text-center py-8 text-[var(--color-ink-soft)] font-[var(--font-hand)] text-lg">
            ✦ 点击按钮开始抽卡 ✦
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================
// 2. ROSTER / COLLECTION COUNTER
// =====================================
function RosterCounter() {
  const total = cards.length;
  const [owned, setOwned] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(owned);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOwned(next);
  };

  const count5 = cards.filter((c) => c.rarity === 5 && owned.has(c.id)).length;
  const total5 = cards.filter((c) => c.rarity === 5).length;

  return (
    <div className="p-5 sm:p-7 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 grid place-items-center bg-[var(--color-forest)] text-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded">
          <Calculator size={20} />
        </div>
        <div>
          <h3 className="font-[var(--font-display)] text-xl">ROSTER</h3>
          <div className="text-xs text-[var(--color-ink-soft)]">卡牌收集进度 · 点击切换</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <Stat k={owned.size} v={`/ ${total} 张`} c="var(--color-tomato)" />
        <Stat k={count5} v={`/ ${total5} ★5`} c="var(--color-amber)" />
        <Stat k={`${Math.round((owned.size / total) * 100)}%`} v="完成度" c="var(--color-forest)" />
      </div>

      <div className="h-2 bg-[var(--color-cream-deep)] rounded-full overflow-hidden border border-[var(--color-ink)] mb-4">
        <motion.div
          className="h-full bg-gradient-to-r from-[var(--color-tomato)] to-[var(--color-amber)]"
          animate={{ width: `${(owned.size / total) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto pr-1">
        {cards.map((c) => {
          const isOwned = owned.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={cn(
                "relative aspect-[2/3] border-2 border-[var(--color-ink)] rounded overflow-hidden transition-all",
                isOwned ? "" : "grayscale opacity-30"
              )}
              style={{ background: rarityBg(c.rarity) }}
            >
              <div className="absolute inset-0 grid place-items-center text-3xl">{c.art}</div>
              <div className="absolute top-0.5 left-0.5 flex">
                {Array.from({ length: c.rarity }).map((_, j) => (
                  <span key={j} className="text-[8px] text-[var(--color-cream)]">★</span>
                ))}
              </div>
              {isOwned && (
                <div className="absolute bottom-0 left-0 right-0 bg-[var(--color-tomato)] text-[var(--color-cream)] text-[9px] text-center font-bold border-t border-[var(--color-ink)]">
                  OWNED
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ k, v, c }: { k: number | string; v: string; c: string }) {
  return (
    <div className="p-3 bg-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded">
      <div className="font-[var(--font-display)] text-2xl sm:text-3xl" style={{ color: c }}>{k}</div>
      <div className="text-[10px] text-[var(--color-ink-soft)] font-[var(--font-jp)] mt-0.5">{v}</div>
    </div>
  );
}

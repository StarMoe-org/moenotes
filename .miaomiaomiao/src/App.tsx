import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music,
  Users,
  Calendar,
  Sparkles,
  Search,
  ArrowUpRight,
  Play,
  Star,
  Disc3,
  ChevronRight,
  Menu,
  X,
  Sun,
  Disc,
  BookOpen,
  Heart,
  TrendingUp,
  Radio,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "./utils/cn";

// ============== DATA ==============
const SONGS = [
  {
    id: 1,
    title: "白昼夢のアンサンブル",
    titleEn: "Daydream Ensemble",
    band: "OurNotes",
    difficulty: "EXPERT",
    level: 26,
    bpm: 142,
    release: "2025.04.12",
    accent: "coral",
  },
  {
    id: 2,
    title: "桜色メモリー",
    titleEn: "Sakura-iro Memory",
    band: "Spring Diary",
    difficulty: "HARD",
    level: 22,
    bpm: 128,
    release: "2025.03.28",
    accent: "sakura",
  },
  {
    id: 3,
    title: "ノートに書いた約束",
    titleEn: "The Promise in My Notes",
    band: "OurNotes",
    difficulty: "EXPERT",
    level: 27,
    bpm: 156,
    release: "2025.04.20",
    accent: "moss",
  },
  {
    id: 4,
    title: "放課後ステップ",
    titleEn: "After-School Step",
    band: "Afterschool",
    difficulty: "NORMAL",
    level: 18,
    bpm: 118,
    release: "2025.02.14",
    accent: "mustard",
  },
  {
    id: 5,
    title: "夜明けのハーモニー",
    titleEn: "Harmony at Dawn",
    band: "OurNotes",
    difficulty: "MASTER",
    level: 30,
    bpm: 168,
    release: "2025.05.01",
    accent: "rose",
  },
  {
    id: 6,
    title: "紙飛行機の彼方へ",
    titleEn: "Beyond the Paper Plane",
    band: "Sky Letter",
    difficulty: "EXPERT",
    level: 25,
    bpm: 136,
    release: "2025.03.10",
    accent: "coral",
  },
];

const CHARACTERS = [
  {
    name: "白鳥 詩音",
    nameRomaji: "Shiratori Shion",
    role: "Vocal · Guitar",
    color: "#E87461",
    bg: "#FBE3DC",
    number: "01",
    tagline: "夢を追う、放課後の歌姫。",
  },
  {
    name: "森川 ひなの",
    nameRomaji: "Morikawa Hinano",
    role: "Bass · Chorus",
    color: "#5B7553",
    bg: "#E4EBDD",
    number: "02",
    tagline: "冷静な瞳に、熱い想いを隠して。",
  },
  {
    name: "桃瀬 さくら",
    nameRomaji: "Momose Sakura",
    role: "Keyboard",
    color: "#B85C6B",
    bg: "#FBE8E4",
    number: "03",
    tagline: "春の訪れを運ぶ、ピアノの妖精。",
  },
  {
    name: "結城 あかり",
    nameRomaji: "Yuuki Akari",
    role: "Drums",
    color: "#D8A24A",
    bg: "#F7EDD9",
    number: "04",
    tagline: "太鼓のように、心を打ち鳴らせ。",
  },
];

const EVENTS = [
  {
    title: "はじめまして、OurNotes です",
    period: "2025.04.01 — 2025.04.15",
    type: "Story Event",
    attr: "happy",
    accent: "coral",
  },
  {
    title: "放課後の音楽室",
    period: "2025.04.16 — 2025.04.30",
    type: "Challenge Live",
    attr: "pure",
    accent: "sakura",
  },
  {
    title: "桜舞う季節に",
    period: "2025.05.01 — 2025.05.15",
    type: "Raid Event",
    attr: "cool",
    accent: "moss",
  },
];

const GAACHA = [
  { name: "Opening Gacha — はじまりの季節", period: "2025.04.01 — 04.30", rarity: "★4×2", accent: "coral" }, // emoji-allow
  { name: "桜の下で待ち合わせ", period: "2025.04.12 — 04.25", rarity: "★4×1", accent: "sakura" }, // emoji-allow
  { name: "放課後セッション", period: "2025.04.20 — 05.05", rarity: "★4×1", accent: "mustard" }, // emoji-allow
];

// ============== SMALL COMPONENTS ==============

function SectionLabel({ num, title, en }: { num: string; title: string; en: string }) {
  return (
    <div className="flex items-end gap-4 mb-8">
      <span className="font-serif text-sm text-coral tracking-[0.3em]">{num}</span>
      <div className="flex items-baseline gap-3">
        <h2 className="font-serif text-3xl md:text-4xl font-semibold text-ink tracking-tight">
          {title}
        </h2>
        <span className="text-ink-muted text-xs tracking-[0.25em] uppercase">{en}</span>
      </div>
      <div className="flex-1 h-px bg-line mb-3" />
    </div>
  );
}

function AccentDot({ color }: { color: string }) {
  return <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />;
}

// ============== NAV ==============

function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { name: "Songs", jp: "楽曲", href: "#songs" },
    { name: "Members", jp: "メンバー", href: "#members" },
    { name: "Events", jp: "イベント", href: "#events" },
    { name: "Gacha", jp: "ガチャ", href: "#gacha" },
    { name: "Archive", jp: "アーカイブ", href: "#archive" },
  ];

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-500",
        scrolled ? "py-2" : "py-5"
      )}
    >
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <div
          className={cn(
            "flex items-center justify-between rounded-full border transition-all duration-500",
            scrolled
              ? "bg-paper/85 backdrop-blur-xl border-line shadow-[0_4px_30px_rgba(43,42,39,0.06)]"
              : "bg-transparent border-transparent"
          )}
          style={{ padding: scrolled ? "12px 20px" : "8px 16px" }}
        >
          {/* Logo */}
          <a href="#top" className="flex items-center gap-3 pl-2 group">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-coral flex items-center justify-center text-paper font-serif text-sm font-bold">
                M
              </div>
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-moss" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-serif text-lg font-semibold tracking-tight text-ink">
                Moenotes
              </span>
              <span className="text-[10px] tracking-[0.3em] text-ink-muted uppercase">
                OurNotes Viewer
              </span>
            </div>
          </a>

          {/* Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {links.map((l) => (
              <a
                key={l.name}
                href={l.href}
                className="group px-4 py-2 rounded-full flex items-baseline gap-1.5 text-sm text-ink-soft hover:text-ink transition-colors"
              >
                <span className="font-medium">{l.jp}</span>
                <span className="text-[10px] tracking-widest text-ink-muted uppercase group-hover:text-coral transition-colors">
                  {l.name}
                </span>
              </a>
            ))}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2">
            <button className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-full text-sm text-ink-muted hover:text-ink hover:bg-cream-2 transition-all">
              <Search size={14} />
              <span className="text-xs">検索...</span>
              <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-line text-ink-muted">⌘K</kbd>
            </button>
            <a
              href="https://pjsk.moe"
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-paper text-sm hover:bg-coral-deep transition-colors"
            >
              MoeSekai
              <ArrowUpRight size={13} />
            </a>
            <button
              onClick={() => setOpen(!open)}
              className="lg:hidden p-2 rounded-full hover:bg-cream-2"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="lg:hidden mt-2 mx-4 bg-paper border border-line rounded-3xl p-4 shadow-xl"
            >
              {links.map((l) => (
                <a
                  key={l.name}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between py-3 border-b border-line last:border-0"
                >
                  <span className="font-medium">{l.jp}</span>
                  <span className="text-xs text-ink-muted uppercase tracking-widest">{l.name}</span>
                </a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}

// ============== HERO ==============

function Hero() {
  return (
    <section id="top" className="relative pt-32 md:pt-40 pb-20 md:pb-32 overflow-hidden">
      {/* Decorative floating shapes */}
      <div className="absolute top-40 right-[8%] w-40 h-40 rounded-full bg-coral-soft/60 blur-2xl animate-softfloat" />
      <div className="absolute bottom-20 left-[6%] w-56 h-56 rounded-full bg-moss-soft/70 blur-3xl" />
      <div className="absolute top-60 left-[45%] w-24 h-24 rounded-full bg-sakura-soft/70 blur-xl animate-softfloat" style={{ animationDelay: "1.5s" }} />

      <div className="relative mx-auto max-w-[1400px] px-6 md:px-10">
        {/* Top meta bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs tracking-[0.25em] uppercase text-ink-muted mb-12"
        >
          <span className="flex items-center gap-2">
            <span className="w-6 h-px bg-coral" />
            Issue N°01 — Spring 2025
          </span>
          <span className="hidden md:inline-flex items-center gap-2">
            <Sun size={11} className="text-mustard" />
            新・青春リズムプロジェクト
          </span>
          <span className="hidden md:inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse" />
            Live from Tokyo
          </span>
        </motion.div>

        <div className="grid grid-cols-12 gap-6 items-end">
          {/* Left: big title */}
          <div className="col-span-12 lg:col-span-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.1 }}
            >
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-coral-soft text-coral-deep text-xs font-medium tracking-wider mb-8">
                <Sparkles size={11} />
                バンドリ！ 新プロジェクト
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="font-serif text-[13vw] md:text-[9.5vw] lg:text-[8.5rem] leading-[0.92] font-semibold text-ink tracking-[-0.02em]"
            >
              Our
              <span className="italic text-coral font-light">Notes</span>
              <br />
              <span className="text-ink-soft font-light">の</span>
              <span className="italic">すべて</span>
              <span className="text-ink-soft font-light">を、</span>
              <br />
              <span className="text-moss-deep font-serif">ノート</span>
              <span className="font-light">しよう。</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="mt-10 max-w-xl text-ink-soft leading-relaxed text-[15px]"
            >
              <span className="font-serif text-ink font-semibold">Moenotes</span> は、
              BanG Dream! 新プロジェクト <span className="font-serif">OurNotes</span> の楽曲・キャラクター・イベントを、
              美しく読みやすい雑誌のようなひとつのノートにまとめた viewer です。
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.65 }}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <a
                href="#songs"
                className="group inline-flex items-center gap-3 px-6 py-3.5 rounded-full bg-ink text-paper text-sm font-medium hover:bg-coral-deep transition-all"
              >
                <Music size={15} />
                楽曲を見る
                <span className="w-6 h-px bg-paper/70 group-hover:w-10 transition-all" />
              </a>
              <a
                href="#members"
                className="group inline-flex items-center gap-3 px-6 py-3.5 rounded-full border border-ink/20 text-ink text-sm font-medium hover:border-coral hover:text-coral-deep transition-all"
              >
                <Users size={15} />
                メンバー紹介
                <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </a>
            </motion.div>
          </div>

          {/* Right: magazine cover card */}
          <div className="col-span-12 lg:col-span-4">
            <motion.div
              initial={{ opacity: 0, rotate: -4, y: 40 }}
              animate={{ opacity: 1, rotate: 0, y: 0 }}
              transition={{ duration: 1.1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative aspect-[3/4] rounded-[28px] overflow-hidden paper-texture shadow-[0_30px_60px_-20px_rgba(43,42,39,0.25)] border border-line"
            >
              {/* Cover illustration area — gradient composition */}
              <div className="absolute inset-0 bg-gradient-to-br from-coral-soft via-cream to-moss-soft" />
              <div className="absolute top-0 right-0 w-2/3 h-1/2 bg-gradient-to-bl from-sakura-soft to-transparent" />
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-cream/90 via-cream/40 to-transparent" />

              {/* Circle deco */}
              <div className="absolute top-8 left-8 w-20 h-20 rounded-full border border-coral/40" />
              <div className="absolute top-12 left-12 w-12 h-12 rounded-full bg-coral/80" />
              <div className="absolute bottom-24 right-6 w-32 h-32 rounded-full bg-moss/10" />
              <div className="absolute bottom-32 right-14 w-16 h-16 rounded-full bg-moss/70" />

              {/* Play badge */}
              <div className="absolute top-8 right-8 flex items-center gap-2 px-3 py-1.5 rounded-full bg-paper/90 backdrop-blur text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse" />
                Now Playing
              </div>

              {/* Vertical JP text */}
              <div className="absolute top-20 right-8 vertical-jp font-serif text-sm text-ink-muted hidden md:block">
                青春・音楽・ノート — 2025 Spring
              </div>

              {/* Bottom info */}
              <div className="absolute bottom-0 inset-x-0 p-7">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-ink-muted uppercase mb-3">
                  <Disc3 size={10} />
                  Featured Track · 01
                </div>
                <h3 className="font-serif text-2xl leading-tight text-ink mb-2">
                  白昼夢の<br />アンサンブル
                </h3>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-ink-soft font-serif italic">Daydream Ensemble</span>
                  <button className="w-10 h-10 rounded-full bg-ink text-paper flex items-center justify-center hover:bg-coral-deep transition-colors">
                    <Play size={13} className="ml-0.5" />
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="mt-6 grid grid-cols-3 gap-3"
            >
              {[
                { v: "128", l: "楽曲", en: "Songs" },
                { v: "24", l: "メンバー", en: "Members" },
                { v: "3.2M", l: "プレイ", en: "Plays" },
              ].map((s) => (
                <div key={s.l} className="p-4 rounded-2xl bg-paper border border-line">
                  <div className="font-serif text-2xl font-semibold text-ink">{s.v}</div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-xs text-ink">{s.l}</span>
                    <span className="text-[10px] tracking-widest text-ink-muted uppercase">{s.en}</span>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Marquee */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="mt-24 -mx-6 md:-mx-10 overflow-hidden border-y border-line py-5 bg-paper/40"
        >
          <div className="flex gap-12 whitespace-nowrap animate-marquee font-serif text-2xl md:text-3xl text-ink-soft">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-12 font-light">
                <span>青春の一ページ</span>
                <span className="text-coral">✦</span> {/* emoji-allow */}
                <span className="italic">Daydream Ensemble</span>
                <span className="text-moss">✦</span> {/* emoji-allow */}
                <span>放課後の音楽室</span>
                <span className="text-mustard">✦</span> {/* emoji-allow */}
                <span className="italic font-serif">OurNotes, 2025</span>
                <span className="text-rose">✦</span> {/* emoji-allow */}
                <span>ノートに書いた約束</span>
                <span className="text-coral">✦</span> {/* emoji-allow */}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ============== SONGS ==============

const accentMap: Record<string, { bg: string; text: string; ring: string; solid: string }> = {
  coral: { bg: "bg-coral-soft", text: "text-coral-deep", ring: "ring-coral/30", solid: "#E87461" },
  sakura: { bg: "bg-sakura-soft", text: "text-rose", ring: "ring-rose/30", solid: "#B85C6B" },
  moss: { bg: "bg-moss-soft", text: "text-moss-deep", ring: "ring-moss/30", solid: "#5B7553" },
  mustard: { bg: "bg-[#F7EDD9]", text: "text-[#8B6914]", ring: "ring-mustard/30", solid: "#D8A24A" },
  rose: { bg: "bg-sakura-soft", text: "text-rose", ring: "ring-rose/30", solid: "#B85C6B" },
};

function Songs() {
  const [filter, setFilter] = useState("ALL");
  const filters = ["ALL", "OurNotes", "Spring Diary", "Afterschool", "Sky Letter"];
  const filtered = filter === "ALL" ? SONGS : SONGS.filter((s) => s.band === filter);

  return (
    <section id="songs" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
          <div>
            <SectionLabel num="§ 02" title="楽曲ライブラリ" en="Song Library" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all border",
                  filter === f
                    ? "bg-ink text-paper border-ink"
                    : "bg-paper text-ink-soft border-line hover:border-ink/40"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Featured song card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
          className="relative rounded-[32px] overflow-hidden mb-10 paper-texture border border-line"
        >
          <div className="grid grid-cols-12 gap-0">
            <div className="col-span-12 md:col-span-5 relative min-h-[280px] md:min-h-[360px] bg-gradient-to-br from-coral-soft via-[#F7D5C5] to-moss-soft">
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 30, ease: "linear", repeat: Infinity }}
                  className="w-48 h-48 rounded-full border-2 border-coral-deep/30 flex items-center justify-center"
                >
                  <div className="w-36 h-36 rounded-full border border-coral-deep/40 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-coral-deep text-paper flex items-center justify-center font-serif text-2xl font-semibold shadow-xl">
                      01
                    </div>
                  </div>
                </motion.div>
              </div>
              <div className="absolute top-6 left-6 text-[10px] tracking-[0.3em] text-coral-deep uppercase">
                Featured · Pick of the Week
              </div>
              <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                <span className="font-serif italic text-sm text-coral-deep">Listen now →</span>
                <div className="flex items-center gap-1.5">
                  {[2, 4, 3, 5, 2, 4, 3, 2, 5, 3, 4, 2].map((h, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [8, h * 4, 8] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.08 }}
                      className="w-1 rounded-full bg-coral-deep/70"
                      style={{ height: 8 }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="col-span-12 md:col-span-7 p-8 md:p-12">
              <div className="flex items-center gap-3 text-xs text-ink-muted mb-5">
                <span className="px-2 py-0.5 rounded bg-coral-soft text-coral-deep font-medium">OurNotes</span>
                <span>2025.04.12 Release</span>
                <span className="text-coral">·</span>
                <span>BPM 142</span>
              </div>
              <h3 className="font-serif text-4xl md:text-5xl font-semibold leading-tight text-ink mb-3">
                白昼夢の<br className="md:hidden" />
                <span className="italic text-coral-deep">アンサンブル</span>
              </h3>
              <p className="text-sm text-ink-soft font-serif italic mb-8">Daydream Ensemble</p>
              <p className="text-ink-soft leading-relaxed max-w-lg mb-8">
                放課後の教室で紡がれる、四人の青春と音楽の物語。
                軽やかなギターリフと、少し切ないメロディが交わる、
                新プロジェクトを象徴する一曲。
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { d: "EASY", l: "11" },
                  { d: "NORMAL", l: "18" },
                  { d: "HARD", l: "22" },
                  { d: "EXPERT", l: "26" },
                ].map((d) => (
                  <div key={d.d} className="p-3 rounded-xl border border-line bg-cream/60">
                    <div className="text-[10px] tracking-widest text-ink-muted uppercase">{d.d}</div>
                    <div className="font-serif text-2xl font-semibold text-ink mt-1">{d.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Song list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence>
            {filtered.map((song, i) => {
              const a = accentMap[song.accent];
              return (
                <motion.div
                  key={song.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  className="group relative rounded-2xl bg-paper border border-line overflow-hidden hover:shadow-[0_20px_40px_-20px_rgba(43,42,39,0.2)] transition-all cursor-pointer"
                >
                  {/* Cover */}
                  <div className={cn("relative h-44 overflow-hidden", a.bg)}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-24 h-24 rounded-full bg-paper/40 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="font-serif text-3xl" style={{ color: a.solid }}>
                          {song.id.toString().padStart(2, "0")}
                        </span>
                      </div>
                    </div>
                    <div className="absolute top-4 left-4 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-paper/80 backdrop-blur text-[10px] font-medium tracking-wider uppercase" style={{ color: a.solid }}>
                        {song.band}
                      </span>
                    </div>
                    <div className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-ink/80 text-paper text-[10px] font-medium">
                      Lv.{song.level}
                    </div>
                    <button className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-ink text-paper flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all hover:bg-coral-deep">
                      <Play size={13} className="ml-0.5" />
                    </button>
                  </div>
                  {/* Info */}
                  <div className="p-5">
                    <div className="flex items-baseline gap-2 text-[10px] tracking-[0.2em] text-ink-muted uppercase mb-2">
                      <span>{song.difficulty}</span>
                      <span>·</span>
                      <span>BPM {song.bpm}</span>
                    </div>
                    <h4 className="font-serif text-xl font-semibold text-ink leading-tight mb-1 group-hover:text-coral-deep transition-colors">
                      {song.title}
                    </h4>
                    <p className="text-xs text-ink-soft font-serif italic">{song.titleEn}</p>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-line/70">
                      <span className="text-xs text-ink-muted">{song.release}</span>
                      <span className="flex items-center gap-1 text-xs text-ink-soft group-hover:text-coral-deep transition-colors">
                        詳細 <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="mt-10 flex justify-center">
          <a
            href="#"
            className="group inline-flex items-center gap-3 px-6 py-3 rounded-full border border-ink/20 text-ink text-sm hover:border-coral hover:text-coral-deep transition-all"
          >
            <Disc size={14} />
            すべての楽曲を見る（128件）
            <ArrowUpRight size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ============== MEMBERS ==============

function Members() {
  return (
    <section id="members" className="relative py-24 md:py-32 bg-paper/40 border-y border-line">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-12">
          <SectionLabel num="§ 03" title="メンバー紹介" en="Members" />
          <p className="text-sm text-ink-soft max-w-sm">
            四人の少女が織りなす、新しい青春のアンサンブル。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {CHARACTERS.map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.1 }}
              whileHover={{ y: -6 }}
              className="group relative rounded-[24px] overflow-hidden border border-line bg-paper"
            >
              {/* Portrait area */}
              <div className="relative aspect-[3/4] overflow-hidden" style={{ background: c.bg }}>
                {/* Decorative shapes */}
                <div className="absolute inset-0">
                  <div
                    className="absolute top-10 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full blur-xl opacity-60"
                    style={{ background: c.color }}
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 h-2/3"
                    style={{
                      background: `linear-gradient(to top, ${c.color}30, transparent)`,
                    }}
                  />
                </div>

                {/* Number */}
                <div className="absolute top-5 left-5 font-serif text-xs tracking-[0.3em]" style={{ color: c.color }}>
                  N° {c.number}
                </div>

                {/* JP vertical text */}
                <div
                  className="absolute top-5 right-5 vertical-jp font-serif text-[10px] hidden md:block"
                  style={{ color: c.color }}
                >
                  OurNotes Member
                </div>

                {/* Silhouette / illustration placeholder */}
                <div className="absolute inset-0 flex items-end justify-center">
                  <svg viewBox="0 0 200 260" className="w-4/5 h-auto drop-shadow-lg">
                    <defs>
                      <linearGradient id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.color} stopOpacity="0.9" />
                        <stop offset="100%" stopColor={c.color} stopOpacity="1" />
                      </linearGradient>
                    </defs>
                    {/* Hair back */}
                    <ellipse cx="100" cy="100" rx="55" ry="60" fill={`url(#grad-${i})`} opacity="0.85" />
                    {/* Face */}
                    <ellipse cx="100" cy="110" rx="38" ry="44" fill="#FFF5EC" />
                    {/* Hair front */}
                    <path
                      d="M62 95 Q70 60 100 55 Q130 60 138 95 Q130 75 115 80 Q110 70 100 72 Q90 70 85 80 Q70 75 62 95 Z"
                      fill={`url(#grad-${i})`}
                    />
                    {/* Eyes */}
                    <ellipse cx="85" cy="115" rx="4" ry="6" fill={c.color} />
                    <ellipse cx="115" cy="115" rx="4" ry="6" fill={c.color} />
                    <circle cx="86" cy="113" r="1.2" fill="#fff" />
                    <circle cx="116" cy="113" r="1.2" fill="#fff" />
                    {/* Mouth */}
                    <path d="M95 135 Q100 138 105 135" stroke={c.color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    {/* Body */}
                    <path
                      d="M55 200 Q60 170 80 160 L120 160 Q140 170 145 200 L145 260 L55 260 Z"
                      fill={`url(#grad-${i})`}
                      opacity="0.9"
                    />
                    {/* Collar */}
                    <path d="M85 160 L100 175 L115 160 L110 170 L100 180 L90 170 Z" fill="#FFF5EC" />
                  </svg>
                </div>

                {/* Hover play */}
                <div className="absolute bottom-5 right-5 w-11 h-11 rounded-full bg-paper/90 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all">
                  <Play size={13} style={{ color: c.color }} className="ml-0.5" />
                </div>
              </div>

              {/* Info */}
              <div className="p-6">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: c.color }}>
                  <AccentDot color={c.color} />
                  {c.role}
                </div>
                <h4 className="font-serif text-2xl font-semibold text-ink leading-tight mb-1">
                  {c.name}
                </h4>
                <p className="text-xs text-ink-muted font-serif italic mb-4">{c.nameRomaji}</p>
                <p className="text-sm text-ink-soft leading-relaxed">{c.tagline}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============== EVENTS & GACHA ==============

function EventsAndGacha() {
  return (
    <section id="events" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <SectionLabel num="§ 04" title="イベント & ガチャ" en="Events · Gacha" />

        <div className="grid grid-cols-12 gap-5">
          {/* Events — 3 featured */}
          <div className="col-span-12 lg:col-span-8">
            <div className="flex items-center gap-3 mb-5">
              <Calendar size={16} className="text-coral" />
              <h3 className="font-serif text-xl font-semibold">イベントアーカイブ</h3>
              <span className="text-xs text-ink-muted tracking-widest uppercase">Events</span>
            </div>
            <div className="space-y-4">
              {EVENTS.map((e, i) => {
                const a = accentMap[e.accent];
                return (
                  <motion.div
                    key={e.title}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    className="group relative flex items-stretch gap-0 rounded-2xl bg-paper border border-line overflow-hidden hover:shadow-[0_15px_35px_-15px_rgba(43,42,39,0.15)] transition-all cursor-pointer"
                  >
                    <div className={cn("w-2", a.bg)} style={{ background: a.solid }} />
                    <div className="flex-1 p-6 flex items-center gap-6 flex-wrap">
                      <div className="font-serif text-xs text-ink-muted tracking-[0.25em] w-16">
                        N°{String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase text-ink-muted mb-1.5">
                          <span style={{ color: a.solid }}>{e.type}</span>
                          <span>·</span>
                          <span>{e.attr}</span>
                        </div>
                        <h4 className="font-serif text-xl font-semibold text-ink group-hover:text-coral-deep transition-colors">
                          {e.title}
                        </h4>
                      </div>
                      <div className="text-xs text-ink-soft font-mono">{e.period}</div>
                      <div className="w-10 h-10 rounded-full border border-line flex items-center justify-center group-hover:bg-coral group-hover:border-coral group-hover:text-paper transition-all">
                        <ChevronRight size={14} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Gacha */}
          <div id="gacha" className="col-span-12 lg:col-span-4">
            <div className="flex items-center gap-3 mb-5">
              <Sparkles size={16} className="text-mustard" />
              <h3 className="font-serif text-xl font-semibold">ガチャ</h3>
              <span className="text-xs text-ink-muted tracking-widest uppercase">Gacha</span>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-mustard/10 via-coral-soft/30 to-sakura-soft/30 p-5 border border-line mb-4">
              <div className="text-[10px] tracking-[0.3em] text-coral-deep uppercase mb-2">Featured Pickup</div>
              <h4 className="font-serif text-lg font-semibold text-ink leading-tight mb-3">
                はじまりの季節 — Opening Gacha
              </h4>
              <div className="flex items-center gap-2">
                {["★4 詩音", "★4 ひなの", "★3 さくら"].map((r, i) => ( // emoji-allow
                  <span key={i} className="px-2.5 py-1 rounded-full bg-paper/80 text-[11px] text-ink-soft border border-line">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {GAACHA.map((g, i) => {
                const a = accentMap[g.accent];
                return (
                  <motion.div
                    key={g.name}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.08 }}
                    className="group p-4 rounded-xl bg-paper border border-line hover:border-ink/30 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: a.solid + "20", color: a.solid }}>
                          <Star size={13} />
                        </div>
                        <div>
                          <h5 className="font-serif text-sm font-semibold text-ink leading-snug group-hover:text-coral-deep transition-colors">
                            {g.name}
                          </h5>
                          <div className="text-[11px] text-ink-muted mt-1">{g.period}</div>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cream-2 text-ink-soft whitespace-nowrap">
                        {g.rarity}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============== ARCHIVE / TIDBITS ==============

function Archive() {
  const tidbits = [
    {
      icon: Radio,
      title: "ラジオアーカイブ",
      sub: "Radio Archive",
      desc: "メンバーが綴る放課後のひととき。全 42 回を配信中。",
      count: "42 eps",
      accent: "coral",
    },
    {
      icon: BookOpen,
      title: "ストーリー",
      sub: "Main Story",
      desc: "第一章「はじまりの音」を、全文・全ボイスで読み返そう。",
      count: "Ch.1 — 12",
      accent: "moss",
    },
    {
      icon: ImageIcon,
      title: "カードギャラリー",
      sub: "Card Gallery",
      desc: "描き下ろしイラスト、スチル、限定カードを一挙公開。",
      count: "320+ cards",
      accent: "sakura",
    },
    {
      icon: TrendingUp,
      title: "ランキング",
      sub: "Rankings",
      desc: "ハイスコア、難易度、人気楽曲のランキングを毎日更新。",
      count: "Daily",
      accent: "mustard",
    },
  ];

  return (
    <section id="archive" className="relative py-24 md:py-32 bg-paper/40 border-y border-line">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <SectionLabel num="§ 05" title="アーカイブ & コンテンツ" en="Archive" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {tidbits.map((t, i) => {
            const a = accentMap[t.accent];
            const Icon = t.icon;
            return (
              <motion.div
                key={t.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                whileHover={{ y: -4 }}
                className="group relative rounded-2xl bg-paper border border-line p-7 overflow-hidden cursor-pointer transition-all hover:shadow-[0_20px_40px_-20px_rgba(43,42,39,0.2)]"
              >
                <div
                  className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `radial-gradient(circle, ${a.solid}25, transparent 70%)` }}
                />
                <div
                  className="relative w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: a.solid + "15", color: a.solid }}
                >
                  <Icon size={20} />
                </div>
                <div className="relative">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-ink-muted mb-2">{t.sub}</div>
                  <h4 className="font-serif text-xl font-semibold text-ink mb-3 group-hover:text-coral-deep transition-colors">
                    {t.title}
                  </h4>
                  <p className="text-sm text-ink-soft leading-relaxed mb-6">{t.desc}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-line">
                    <span className="text-xs text-ink-muted font-mono">{t.count}</span>
                    <span className="text-xs text-ink-soft flex items-center gap-1 group-hover:text-coral-deep transition-colors">
                      見る <ArrowUpRight size={12} />
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Newsletter / CTA strip */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mt-16 relative rounded-[32px] overflow-hidden border border-line"
        >
          <div className="grid grid-cols-12 relative bg-gradient-to-br from-coral-soft via-cream to-moss-soft">
            <div className="absolute top-10 right-10 w-32 h-32 rounded-full bg-coral/20 blur-2xl" />
            <div className="absolute bottom-10 left-20 w-40 h-40 rounded-full bg-moss/20 blur-3xl" />
            <div className="col-span-12 md:col-span-7 p-10 md:p-14 relative">
              <div className="text-[10px] tracking-[0.3em] text-coral-deep uppercase mb-4">
                Stay Tuned · 最新情報を購読
              </div>
              <h3 className="font-serif text-3xl md:text-5xl font-semibold text-ink leading-tight mb-4">
                ノートは、<br />
                <span className="italic text-coral-deep">毎週金曜</span>に更新されます。
              </h3>
              <p className="text-ink-soft max-w-lg mb-8">
                新曲・イベント・ガチャ情報を、いち早くメールでお届けします。
                購読は無料、いつでも解除できます。
              </p>
              <form className="flex flex-wrap gap-3 max-w-lg">
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="flex-1 min-w-[200px] px-5 py-3.5 rounded-full bg-paper border border-line text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-coral transition-colors"
                />
                <button
                  type="button"
                  className="px-6 py-3.5 rounded-full bg-ink text-paper text-sm font-medium hover:bg-coral-deep transition-colors inline-flex items-center gap-2"
                >
                  購読する
                  <Heart size={13} />
                </button>
              </form>
            </div>
            <div className="hidden md:flex col-span-5 relative items-end justify-end p-10">
              <div className="relative w-full aspect-square max-w-[280px]">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 60, ease: "linear", repeat: Infinity }}
                  className="absolute inset-0 rounded-full border border-coral-deep/30"
                />
                <div className="absolute inset-6 rounded-full border border-moss/40" />
                <div className="absolute inset-12 rounded-full bg-paper/70 backdrop-blur flex flex-col items-center justify-center text-center p-6">
                  <span className="font-serif text-5xl font-semibold text-coral-deep leading-none">金</span>
                  <span className="text-xs text-ink-muted mt-2 tracking-widest uppercase">Friday Update</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ============== FOOTER ==============

function Footer() {
  return (
    <footer className="relative pt-20 pb-10 overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        {/* Big wordmark */}
        <div className="relative mb-16">
          <h2 className="font-serif text-[18vw] md:text-[14rem] font-semibold leading-none tracking-[-0.03em] text-ink/[0.07] select-none">
            Moenotes
          </h2>
          <div className="absolute inset-0 flex items-end justify-end pb-6 md:pb-10 pr-2 md:pr-6">
            <div className="text-right">
              <div className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-2">
                A MoeSekai Project
              </div>
              <div className="font-serif italic text-sm text-ink-soft">青春を、ノートしよう。</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-14">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-full bg-coral flex items-center justify-center text-paper font-serif text-sm font-bold">
                M
              </div>
              <span className="font-serif text-lg font-semibold text-ink">Moenotes</span>
            </div>
            <p className="text-sm text-ink-soft leading-relaxed max-w-sm mb-5">
              BanG Dream! OurNotes の非公式ファンメイド viewer。
              美しく、読みやすく、遊び心を忘れない。
            </p>
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-moss" />
              運営: MoeSekai Team
            </div>
          </div>

          {[
            { title: "コンテンツ", items: ["楽曲", "メンバー", "イベント", "ガチャ", "カード"] },
            { title: "コミュニティ", items: ["Discord", "Twitter / X", "YouTube", "GitHub", "お問合せ"] },
            { title: "プロジェクト", items: ["MoeSekai", "pjsk.moe", "About Us", "Design System", "更新履歴"] },
          ].map((col) => (
            <div key={col.title}>
              <h5 className="font-serif text-sm font-semibold text-ink mb-4">{col.title}</h5>
              <ul className="space-y-2.5">
                {col.items.map((it) => (
                  <li key={it}>
                    <a href="#" className="text-sm text-ink-soft hover:text-coral-deep transition-colors link-underline">
                      {it}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-line flex flex-wrap items-center justify-between gap-4 text-xs text-ink-muted">
          <div className="flex items-center gap-4 flex-wrap">
            <span>© 2025 Moenotes · MoeSekai</span>
            <span className="hidden md:inline">·</span>
            <span>BanG Dream! © Bushiroad / CraftEgg</span>
            <span className="hidden md:inline">·</span>
            <span className="text-ink-soft">非公式ファンサイト</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-coral-deep transition-colors">プライバシー</a>
            <a href="#" className="hover:text-coral-deep transition-colors">利用規約</a>
            <a href="https://pjsk.moe" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink hover:text-coral-deep transition-colors font-medium">
              pjsk.moe <ArrowUpRight size={11} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ============== APP ==============

export default function App() {
  return (
    <div className="relative min-h-screen">
      <Nav />
      <main>
        <Hero />
        <Songs />
        <Members />
        <EventsAndGacha />
        <Archive />
      </main>
      <Footer />
    </div>
  );
}

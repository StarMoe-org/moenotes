import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Cake, Ruler, Star, Music, Quote, Mic2 } from "lucide-react";
import { getCharacter, getBand, getBandMembers } from "../data/bands";
import { SectionTitle, Tag, FadeIn } from "../components/UI";
import { PlaceholderAvatar, PlaceholderArt, SparkleIcon, StarIcon } from "../components/Placeholders";
import { cn } from "../utils/cn";

export default function CharacterDetail() {
  const { id = "" } = useParams();
  const c = getCharacter(id);
  const band = getBand(c.band);
  const members = getBandMembers(c.band).filter((m) => m.id !== c.id);
  const nav = useNavigate();

  return (
    <div className="paper-grain">
      {/* HERO BAND */}
      <section
        className="relative overflow-hidden text-[var(--color-cream)]"
        style={{ background: `linear-gradient(135deg, ${band.color} 0%, ${band.accent} 100%)` }}
      >
        <div className="absolute inset-0 stripes-cream opacity-30" />
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full opacity-20 bg-[var(--color-cream)]" />
        <div className="absolute inset-0 halftone opacity-20 text-white" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-10 sm:pb-14">
          <button
            onClick={() => nav(-1)}
            className="inline-flex items-center gap-1.5 text-sm font-bold hover:text-[var(--color-amber)] mb-5"
          >
            <ArrowLeft size={16} /> 返回
          </button>

          <div className="grid lg:grid-cols-12 gap-6 lg:gap-10 items-center">
            {/* Big portrait */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
              animate={{ opacity: 1, scale: 1, rotate: -2 }}
              transition={{ duration: 0.6 }}
              className="lg:col-span-5"
            >
              <div className="relative aspect-[3/4] max-w-sm mx-auto">
                <div className={cn("absolute inset-0 rounded-md border-[3px] border-[var(--color-cream)] bg-gradient-to-br shadow-[0_20px_60px_-10px_rgba(0,0,0,.5)]", c.bgGradient)}>
                  <div className="absolute inset-0 halftone opacity-30 text-white" />
                  <div className="absolute inset-0 grid place-items-center text-[180px] sm:text-[220px]">
                    <PlaceholderAvatar id={c.id} label={c.nameJa} color={c.color} className="h-[1em] w-[1em] text-[1em]" />
                  </div>
                  <div className="absolute top-3 left-3 px-3 py-1 bg-[var(--color-cream)] text-[var(--color-ink)] border-2 border-[var(--color-ink)] rounded font-[var(--font-display)] tracking-wider text-sm">
                    {c.position}
                  </div>
                </div>
                {/* Stickers around */}
                <div className="absolute -top-3 -right-3 w-20 h-20 bg-[var(--color-amber)] border-[2.5px] border-[var(--color-ink)] rounded-full grid place-items-center font-[var(--font-display)] text-[var(--color-ink)] text-xs text-center leading-tight shadow-[var(--shadow-stamp-sm)] rotate-12">
                  Rarity 5<br />MAX
                </div>
              </div>
            </motion.div>

            {/* Info */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-7"
            >
              <div className="font-[var(--font-hand)] text-2xl mb-1 opacity-90">{band.slogan}</div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Tag color={band.color}>{band.name}</Tag>
                <Tag>{c.position}</Tag>
                {c.tags.map((t) => <Tag key={t}>{t}</Tag>)}
              </div>
              <h1 className="font-[var(--font-display)] text-5xl sm:text-7xl leading-[0.95] tracking-tight">
                {c.nameJa}
              </h1>
              <div className="font-[var(--font-hand)] text-2xl sm:text-3xl opacity-90 mt-1">
                {c.nameRomaji} / {c.nameCn}
              </div>

              <div className="mt-6 grid sm:grid-cols-3 gap-3">
                <Info icon={Mic2} label="担当" value={c.position} />
                <Info icon={Cake} label="生日" value={c.birthday} />
                <Info icon={Ruler} label="身高" value={c.height || "—"} />
              </div>

              <div className="mt-5 p-4 bg-[var(--color-cream)]/15 border-2 border-[var(--color-cream)]/30 rounded-md backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <Quote size={20} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-[var(--font-jp)] italic text-base sm:text-lg leading-relaxed">
                      「{c.quote}」
                    </div>
                    <div className="font-[var(--font-hand)] text-base mt-1 opacity-80">── {c.nameJa}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Bio */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <SectionTitle eyebrow="Profile" title={<>角色档案 .</>} />
        <div className="grid md:grid-cols-2 gap-6">
          <FadeIn>
            <div className="p-5 sm:p-6 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-card)]">
              <div className="font-[var(--font-display)] text-lg mb-3 flex items-center gap-2">
                <Star size={18} className="text-[var(--color-amber)]" /> 基本信息
              </div>
              <div className="space-y-2 text-sm font-[var(--font-jp)]">
                <Row k="姓名" v={c.nameJa} />
                <Row k="罗马音" v={c.nameRomaji} />
                <Row k="中文" v={c.nameCn} />
                <Row k="CV" v={c.cv} />
                <Row k="所属" v={band.name} />
                <Row k="担当" v={c.position} />
                <Row k="生日" v={c.birthday} />
                {c.height && <Row k="身高" v={c.height} />}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="p-5 sm:p-6 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-card)]">
              <div className="font-[var(--font-display)] text-lg mb-3 flex items-center gap-2">
                <Music size={18} className="text-[var(--color-tomato)]" /> 乐队简介
              </div>
              <p className="text-sm font-[var(--font-jp)] leading-relaxed text-[var(--color-ink-soft)]">
                {c.nameJa} 是乐队 <span className="font-bold">{band.name}</span> 的一员,
                {band.concept}
              </p>
              <Link
                to={`/bands/${band.key}`}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-ink)] text-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded font-bold text-sm"
              >
                探索 {band.name} →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Other members */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <SectionTitle eyebrow="Bandmates" title={<>{band.name} 的其他成员 .</>} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {members.map((m, i) => (
            <FadeIn key={m.id} delay={i * 0.05}>
              <Link to={`/characters/${m.id}`}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="relative aspect-[3/4] rounded-md border-[2.5px] border-[var(--color-ink)] overflow-hidden shadow-[var(--shadow-card)]"
                  style={{ transform: `rotate(${i % 2 ? -1.5 : 1.5}deg)` }}
                >
                  <div className={cn("absolute inset-0 bg-gradient-to-br", m.bgGradient)} />
                  <div className="absolute inset-0 halftone opacity-20 text-white" />
                  <div className="absolute inset-0 grid place-items-center text-[100px]">
                    <PlaceholderAvatar id={m.id} label={m.nameJa} color={m.color} className="h-[1em] w-[1em] text-[1em]" />
                  </div>
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-[var(--color-cream)] border-2 border-[var(--color-ink)] text-xs font-bold rounded-sm">
                    {m.position}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-[var(--color-cream)] border-t-[2.5px] border-[var(--color-ink)]">
                    <div className="font-[var(--font-jp)] font-bold text-xs truncate">{m.nameJa}</div>
                  </div>
                </motion.div>
              </Link>
            </FadeIn>
          ))}
        </div>
      </section>
    </div>
  );
}

function Info({ icon: Icon, label, value }: any) {
  return (
    <div className="p-3 bg-[var(--color-cream)]/15 border-2 border-[var(--color-cream)]/30 rounded-md">
      <div className="flex items-center gap-1.5 text-xs opacity-80">
        <Icon size={14} /> {label}
      </div>
      <div className="font-[var(--font-display)] text-lg mt-0.5">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-ink)]/10 pb-1.5 last:border-0 last:pb-0">
      <span className="w-16 text-[var(--color-ink-soft)] text-xs">{k}</span>
      <span className="font-bold flex-1">{v}</span>
    </div>
  );
}



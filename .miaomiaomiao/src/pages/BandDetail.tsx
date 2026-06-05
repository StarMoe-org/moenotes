import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Music, Play } from "lucide-react";
import { getBand, getBandMembers, songs } from "../data/bands";
import { SectionTitle, FadeIn, Tag } from "../components/UI";
import { memberEmoji } from "../utils/emoji";
import { cn } from "../utils/cn";

export default function BandDetail() {
  const { key = "" } = useParams();
  const b = getBand(key as any);
  const members = getBandMembers(b.key);
  const bandSongs = songs.filter((s) => s.band === b.key);
  const nav = useNavigate();

  return (
    <div className="paper-grain">
      {/* HERO */}
      <section
        className="relative overflow-hidden text-[var(--color-cream)]"
        style={{ background: `linear-gradient(135deg, ${b.color} 0%, ${b.accent} 100%)` }}
      >
        <div className="absolute inset-0 stripes-cream opacity-30" />
        <div className="absolute inset-0 halftone opacity-15 text-white" />
        <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full opacity-15 bg-[var(--color-cream)]" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full opacity-10 bg-[var(--color-cream)]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-14 sm:pb-20">
          <button onClick={() => nav(-1)} className="inline-flex items-center gap-1.5 text-sm font-bold hover:text-[var(--color-amber)] mb-5">
            <ArrowLeft size={16} /> 返回
          </button>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="font-[var(--font-hand)] text-2xl sm:text-3xl mb-2 opacity-90">── {b.formed} ──</div>
            <h1 className="font-[var(--font-display)] text-5xl sm:text-7xl lg:text-8xl leading-[0.92] tracking-tight">
              {b.name}
            </h1>
            <p className="font-[var(--font-jp)] text-xl sm:text-2xl mt-3 italic opacity-95 max-w-2xl">
              {b.slogan}
            </p>
            <p className="font-[var(--font-jp)] text-base sm:text-lg mt-5 opacity-95 max-w-3xl leading-relaxed">
              {b.concept}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Tag color="rgba(255,255,255,.25)">代表曲 · {b.song}</Tag>
              <Tag color="rgba(255,255,255,.25)">成员 · {members.length} 人</Tag>
              <Tag color="rgba(255,255,255,.25)">收录曲 · {bandSongs.length} 首</Tag>
            </div>
          </motion.div>
        </div>
      </section>

      {/* MEMBERS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <SectionTitle
          eyebrow="Members"
          title={<>{members.length} 名成员 .</>}
          subtitle="点击角色卡查看完整档案 ── 包括担当、声优、个人语录。"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-5">
          {members.map((m, i) => (
            <FadeIn key={m.id} delay={i * 0.06}>
              <Link to={`/characters/${m.id}`} className="group block">
                <motion.div
                  whileHover={{ y: -6 }}
                  className="relative aspect-[3/4] rounded-md border-[2.5px] border-[var(--color-ink)] overflow-hidden shadow-[var(--shadow-card)]"
                  style={{ transform: `rotate(${i % 2 ? -1.5 : 1.5}deg)` }}
                >
                  <div className={cn("absolute inset-0 bg-gradient-to-br", m.bgGradient)} />
                  <div className="absolute inset-0 halftone opacity-25 text-white" />
                  <div className="absolute inset-0 grid place-items-center text-[110px] sm:text-[140px]">
                    {memberEmoji(m.id)}
                  </div>
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-[var(--color-cream)] border-2 border-[var(--color-ink)] text-xs font-bold rounded-sm">
                    {m.position}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-[var(--color-cream)] border-t-[2.5px] border-[var(--color-ink)]">
                    <div className="font-[var(--font-jp)] font-bold text-sm truncate">{m.nameJa}</div>
                    <div className="font-[var(--font-hand)] text-xs text-[var(--color-cocoa)] truncate">{m.nameCn}</div>
                  </div>
                </motion.div>
              </Link>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* SONGS */}
      <section className="bg-[var(--color-cream-deep)] py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <SectionTitle
            eyebrow="Discography"
            title={<>代表曲 .</>}
            right={<Link to="/songs" className="text-sm font-bold hover:text-[var(--color-tomato)]">全部歌曲 →</Link>}
          />
          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            {bandSongs.map((s, i) => (
              <FadeIn key={s.id} delay={i * 0.05}>
                <div
                  className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-stamp-sm)] hover:shadow-[var(--shadow-stamp)] transition-all"
                  style={{ transform: `rotate(${i % 2 ? 0.7 : -0.7}deg)` }}
                >
                  <div
                    className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 grid place-items-center border-[2.5px] border-[var(--color-ink)] rounded"
                    style={{ background: b.color }}
                  >
                    <Music size={26} className="text-[var(--color-cream)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)] mb-0.5">
                      <span className="font-[var(--font-display)] tracking-wider text-[var(--color-tomato)]">{s.type.toUpperCase()}</span>
                      <span>·</span>
                      <span>{s.duration}</span>
                    </div>
                    <h3 className="font-[var(--font-display)] text-lg sm:text-xl tracking-tight truncate">{s.title}</h3>
                    <div className="text-xs text-[var(--color-ink-soft)] mt-0.5 font-[var(--font-jp)]">{s.released}</div>
                  </div>
                  {s.hasMV && (
                    <button className="shrink-0 w-10 h-10 grid place-items-center border-2 border-[var(--color-ink)] rounded-full bg-[var(--color-tomato)] text-[var(--color-cream)] hover:scale-110 transition-transform">
                      <Play size={16} fill="currentColor" />
                    </button>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Concept */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <SectionTitle eyebrow="Concept" title={<>乐队理念 .</>} />
        <div
          className="relative p-6 sm:p-10 border-[2.5px] border-[var(--color-ink)] rounded-md text-[var(--color-cream)] overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${b.color} 0%, ${b.accent} 100%)` }}
        >
          <div className="absolute inset-0 stripes-cream opacity-30" />
          <div className="relative">
            <div className="font-[var(--font-hand)] text-2xl mb-2">✦ {b.name} ✦</div>
            <p className="font-[var(--font-jp)] text-lg sm:text-xl leading-relaxed">{b.concept}</p>
            <div className="mt-5 font-[var(--font-jp)] text-2xl italic">{b.slogan}</div>
          </div>
        </div>
      </section>
    </div>
  );
}



import { Link } from "react-router-dom";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { bands, getCharacter, news, events, getBand } from "../data/bands";
import { Stamp, SectionTitle, Tag, FadeIn } from "../components/UI";
import { memberEmoji } from "../utils/emoji";
import {
  ArrowRight, Music, Volume2, Sparkles, Play, Heart, Star,
  Calendar, Mic2, Guitar, ChevronRight, Zap, Headphones,
} from "lucide-react";
import { cn } from "../utils/cn";

export default function Home() {
  const [tab, setTab] = useState(bands[0].key);
  const current = useMemo(() => getBand(tab), [tab]);
  const members = useMemo(
    () => bands.find((b) => b.key === tab)!.members.map(getCharacter),
    [tab]
  );

  return (
    <div className="paper-grain">
      {/* ========== HERO ========== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 staff-bg opacity-50 pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-[var(--color-amber)] rounded-full opacity-30 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-[var(--color-tomato)] rounded-full opacity-25 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 sm:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-start gap-5"
          >
            <Stamp color="var(--color-ink)">
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} /> 官方资料站 · v0.3
              </span>
            </Stamp>

            <h1 className="font-[var(--font-display)] text-[14vw] sm:text-8xl lg:text-9xl leading-[0.85] tracking-tight">
              <span className="block">BANG!</span>
              <span className="block relative">
                DREAM
                <svg className="absolute -top-2 -right-4 sm:right-0 w-8 sm:w-12 text-[var(--color-tomato)]" viewBox="0 0 40 40" fill="currentColor">
                  <path d="M20 0 L24 16 L40 20 L24 24 L20 40 L16 24 L0 20 L16 16 Z" />
                </svg>
              </span>
              <span className="block italic text-[var(--color-tomato)] text-[10vw] sm:text-6xl lg:text-7xl -mt-1 sm:-mt-2">
                our notes.
              </span>
            </h1>

            <p className="font-[var(--font-hand)] text-2xl sm:text-3xl text-[var(--color-cocoa)] -mt-2">
              5 つの音、5 つの物語 ── 5 支乐队, 5 个故事。
            </p>

            <p className="max-w-2xl text-base sm:text-lg text-[var(--color-ink-soft)] font-[var(--font-jp)] leading-relaxed">
              Moenotes 是由 <span className="font-bold text-[var(--color-tomato)]">MoeSekai</span> 团队为{" "}
              <span className="hand-underline font-bold">bangdream ournotes</span> 打造的新一代资料站。
              收录 5 支乐队、25 名角色、卡牌图鉴、活动资讯 ── 一个属于观众的笔记。
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-2">
              <Link
                to="/characters"
                className="group inline-flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 bg-[var(--color-tomato)] text-[var(--color-cream)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-stamp)] font-[var(--font-display)] tracking-wider text-sm sm:text-base hover:shadow-[var(--shadow-stamp-sm)] hover:translate-x-[1px] hover:translate-y-[1px]"
              >
                <Mic2 size={18} /> 探索角色
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/cards"
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 bg-[var(--color-cream)] text-[var(--color-ink)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-stamp)] font-[var(--font-display)] tracking-wider text-sm sm:text-base hover:shadow-[var(--shadow-stamp-sm)] hover:translate-x-[1px] hover:translate-y-[1px]"
              >
                <Music size={18} /> 卡牌图鉴
              </Link>
            </div>
          </motion.div>

          {/* Stats bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10 sm:mt-14 grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {[
              { k: "5", v: "支乐队", icon: Guitar, c: "var(--color-tomato)" },
              { k: "25", v: "名角色", icon: Mic2, c: "var(--color-amber)" },
              { k: "120+", v: "首收录曲", icon: Headphones, c: "var(--color-forest)" },
              { k: "∞", v: "青春记忆", icon: Heart, c: "var(--color-rose)" },
            ].map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-stamp-sm)]"
                style={{ transform: `rotate(${i % 2 === 0 ? -1 : 1}deg)` }}
              >
                <s.icon size={26} style={{ color: s.c }} />
                <div>
                  <div className="font-[var(--font-display)] text-2xl sm:text-3xl leading-none">{s.k}</div>
                  <div className="font-[var(--font-jp)] text-xs sm:text-sm text-[var(--color-ink-soft)] font-bold">{s.v}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ========== BANDS SWITCHER ========== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <SectionTitle
          eyebrow="Our Bands"
          title={
            <>
              五支乐队 <span className="text-[var(--color-tomato)]">.</span>
            </>
          }
          subtitle="切换标签,查看每支乐队的介绍、成员、代表曲与最新活动。"
          right={
            <Link
              to="/bands"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-ink)] hover:text-[var(--color-tomato)]"
            >
              查看全部 <ChevronRight size={16} />
            </Link>
          }
        />

        {/* Tab pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          {bands.map((b, i) => (
            <button
              key={b.key}
              onClick={() => setTab(b.key)}
              className={cn(
                "relative px-4 sm:px-5 py-2.5 border-[2.5px] border-[var(--color-ink)] rounded-full font-[var(--font-jp)] font-bold text-sm sm:text-base transition-all",
                tab === b.key
                  ? "shadow-[var(--shadow-stamp-sm)]"
                  : "bg-[var(--color-cream)] hover:shadow-[2px_2px_0_0_var(--color-ink)]"
              )}
              style={{
                background: tab === b.key ? b.color : undefined,
                color: tab === b.key ? "var(--color-cream)" : "var(--color-ink)",
                transform: tab === b.key ? `rotate(-1deg)` : `rotate(${i % 2 ? 1 : -1}deg)`,
              }}
            >
              {b.name}
            </button>
          ))}
        </div>

        {/* Active band panel */}
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="grid lg:grid-cols-12 gap-6"
        >
          <div
            className="lg:col-span-5 relative overflow-hidden border-[2.5px] border-[var(--color-ink)] rounded-md p-7 sm:p-9 text-[var(--color-cream)]"
            style={{ background: `linear-gradient(135deg, ${current.color} 0%, ${current.accent} 100%)` }}
          >
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20 bg-[var(--color-cream)]" />
            <div className="absolute inset-0 stripes-cream opacity-20" />

            <div className="relative">
              <div className="font-[var(--font-hand)] text-xl opacity-80 mb-1">{current.formed} ──</div>
              <h3 className="font-[var(--font-display)] text-4xl sm:text-5xl leading-tight tracking-tight">
                {current.name}
              </h3>
              <p className="font-[var(--font-jp)] text-base sm:text-lg mt-2 opacity-95">
                {current.slogan}
              </p>
              <p className="font-[var(--font-jp)] text-sm sm:text-[15px] leading-relaxed mt-5 opacity-90">
                {current.concept}
              </p>

              <div className="mt-6 pt-5 border-t-2 border-[var(--color-cream)]/30 flex items-center gap-4 text-sm font-[var(--font-jp)]">
                <div className="flex items-center gap-2">
                  <Volume2 size={16} /> 代表曲 <span className="font-bold">{current.song}</span>
                </div>
              </div>

              <Link
                to={`/bands/${current.key}`}
                className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-cream)] text-[var(--color-ink)] border-2 border-[var(--color-ink)] rounded font-bold text-sm hover:bg-[var(--color-amber)]"
              >
                <Zap size={16} /> 进入乐队页
              </Link>
            </div>
          </div>

          {/* Members grid */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {members.map((m, i) => (
              <Link
                key={m.id}
                to={`/characters/${m.id}`}
                className="group block"
              >
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4, rotate: i % 2 ? 1 : -1 }}
                  className="relative aspect-[3/4] rounded-md border-[2.5px] border-[var(--color-ink)] overflow-hidden shadow-[var(--shadow-card)]"
                  style={{ transform: `rotate(${i % 2 ? -1.5 : 1.5}deg)` }}
                >
                  <div className={cn("absolute inset-0 bg-gradient-to-br", m.bgGradient)} />
                  <div className="absolute inset-0 halftone opacity-20 text-white" />
                  <div className="absolute inset-0 stripes-cream opacity-30" />

                  {/* Big character art via emoji + abstract */}
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="text-[110px] sm:text-[140px] opacity-90 filter-print">
                      {memberEmoji(m.id)}
                    </div>
                  </div>

                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-[var(--color-cream)] border-2 border-[var(--color-ink)] text-xs font-bold font-[var(--font-jp)] rounded-sm">
                    {m.position}
                  </div>
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-[var(--color-tomato)] text-[var(--color-cream)] border-2 border-[var(--color-ink)] text-xs font-bold rounded-sm">
                    5★
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-[var(--color-cream)] border-t-[2.5px] border-[var(--color-ink)]">
                    <div className="font-[var(--font-jp)] font-bold text-sm truncate">{m.nameJa}</div>
                    <div className="font-[var(--font-hand)] text-xs text-[var(--color-cocoa)] truncate">
                      {m.nameCn}
                    </div>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ========== FEATURE CARDS ========== */}
      <section className="bg-[var(--color-ink)] text-[var(--color-cream)] py-16 sm:py-24 relative overflow-hidden">
        <div className="absolute inset-0 stripes-warm opacity-5" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
          <SectionTitle
            eyebrow="What we have"
            title={<>在这里你可以 .</>}
            subtitle="六大功能模块 ── 一个站点满足你对 bangdream ournotes 的所有查阅需求。"
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[
              { to: "/characters", icon: Mic2, title: "角色图鉴", desc: "25 名角色完整档案 ── 担当、声优、属性、语录、关系图。", c: "var(--color-tomato)" },
              { to: "/cards", icon: Music, title: "卡牌图鉴", desc: "按稀有度 / 属性 / 技能筛选。5★ 卡牌详细数值一网打尽。", c: "var(--color-amber)" },
              { to: "/bands", icon: Guitar, title: "乐队专题", desc: "5 支乐队的概念、成员关系、代表曲与 Live 历史。", c: "var(--color-rose)" },
              { to: "/songs", icon: Headphones, title: "歌曲库", desc: "原创、翻唱、印象曲、角色曲 ── 全部整理成册。", c: "var(--color-mint)" },
              { to: "/events", icon: Calendar, title: "活动日程", desc: "Live、Fan Meeting、新曲发售 ── 不错过每一场。", c: "var(--color-yellow)" },
              { to: "/tools", icon: Sparkles, title: "实用工具", desc: "抽卡模拟、属性计算 ── 由玩家为玩家而做。", c: "var(--color-cocoa)" },
            ].map((f, i) => (
              <FadeIn key={f.to} delay={i * 0.05}>
                <Link
                  to={f.to}
                  className="group block p-5 sm:p-6 bg-[var(--color-cream)] text-[var(--color-ink)] border-[2.5px] border-[var(--color-cream)] rounded-md hover:bg-[var(--color-amber)] transition-colors"
                >
                  <f.icon size={32} style={{ color: f.c }} />
                  <div className="mt-3 font-[var(--font-display)] text-xl tracking-tight">{f.title}</div>
                  <p className="mt-1.5 text-sm font-[var(--font-jp)] text-[var(--color-ink-soft)] leading-relaxed">
                    {f.desc}
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1 text-sm font-bold group-hover:translate-x-1 transition-transform">
                    去看看 <ArrowRight size={14} />
                  </div>
                </Link>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ========== NEWS + EVENTS ========== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
          {/* News */}
          <div className="lg:col-span-2">
            <SectionTitle
              eyebrow="Latest News"
              title={<>最新动态 .</>}
              right={
                <span className="font-[var(--font-hand)] text-base text-[var(--color-cocoa)]">更新于 06.18</span>
              }
            />
            <div className="space-y-3">
              {news.map((n, i) => {
                const band = n.band ? getBand(n.band) : null;
                return (
                  <FadeIn key={n.id} delay={i * 0.05}>
                    <Link
                      to="/events"
                      className="group flex items-stretch gap-3 sm:gap-4 p-3 sm:p-4 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-stamp-sm)] hover:shadow-[var(--shadow-stamp)] transition-all"
                      style={{ transform: `rotate(${i % 2 ? 0.5 : -0.5}deg)` }}
                    >
                      <div className="shrink-0 w-16 sm:w-20 text-center pt-1">
                        <div className="font-[var(--font-hand)] text-2xl text-[var(--color-tomato)] leading-none">
                          {n.date.split(".")[2]}
                        </div>
                        <div className="font-[var(--font-display)] text-[10px] tracking-wider text-[var(--color-ink-soft)] mt-0.5">
                          {n.date.split(".")[1]}月
                        </div>
                        <div className="font-[var(--font-jp)] text-[10px] text-[var(--color-ink-soft)]">
                          '25
                        </div>
                      </div>
                      <div className="w-[2px] bg-[var(--color-ink)]/20 my-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <Tag color={band?.color || "var(--color-amber)"}>
                            {band ? band.name : n.category}
                          </Tag>
                          {n.tag && <Tag>{n.tag}</Tag>}
                        </div>
                        <h3 className="font-[var(--font-jp)] font-bold text-base sm:text-lg leading-snug group-hover:text-[var(--color-tomato)] transition-colors">
                          {n.title}
                        </h3>
                        <p className="text-sm text-[var(--color-ink-soft)] mt-1 line-clamp-1">
                          {n.excerpt}
                        </p>
                      </div>
                    </Link>
                  </FadeIn>
                );
              })}
            </div>
          </div>

          {/* Upcoming events */}
          <div>
            <SectionTitle eyebrow="Live Schedule" title={<>近期活动 .</>} />
            <div className="space-y-3">
              {events.filter((e) => e.status === "upcoming").slice(0, 4).map((e, i) => {
                const band = e.band ? getBand(e.band) : null;
                return (
                  <FadeIn key={e.id} delay={i * 0.06}>
                    <div
                      className="p-4 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md"
                      style={{ transform: `rotate(${i % 2 ? 1 : -1}deg)` }}
                    >
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-[var(--font-display)] tracking-wider text-[var(--color-tomato)]">{e.type.toUpperCase()}</span>
                        <span className="font-[var(--font-hand)] text-base text-[var(--color-cocoa)]">{e.date}</span>
                      </div>
                      <h4 className="font-[var(--font-jp)] font-bold text-[15px] leading-snug">{e.title}</h4>
                      {e.location && (
                        <div className="text-xs text-[var(--color-ink-soft)] mt-1.5">📍 {e.location}</div>
                      )}
                      {band && (
                        <div className="mt-2">
                          <Tag color={band.color}>{band.name}</Tag>
                        </div>
                      )}
                    </div>
                  </FadeIn>
                );
              })}
              <Link
                to="/events"
                className="block text-center py-3 border-[2.5px] border-[var(--color-ink)] border-dashed rounded-md font-bold text-sm hover:bg-[var(--color-ink)] hover:text-[var(--color-cream)] transition"
              >
                全部活动日程 →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========== BIG QUOTE ========== */}
      <section className="bg-[var(--color-amber)] py-16 sm:py-24 relative overflow-hidden">
        <div className="absolute inset-0 stripes-cream opacity-40" />
        <div className="max-w-5xl mx-auto px-6 text-center relative">
          <div className="font-[var(--font-hand)] text-2xl sm:text-3xl text-[var(--color-ink)] mb-2">
            ✦ a quote from MyGO!!!!! ✦
          </div>
          <blockquote className="font-[var(--font-display)] text-3xl sm:text-5xl lg:text-6xl leading-[1.1] tracking-tight">
            「迷子でもいい、<br />前へ進め。」
          </blockquote>
          <p className="font-[var(--font-jp)] text-base sm:text-lg text-[var(--color-ink-soft)] mt-5 max-w-2xl mx-auto">
            ── 高松 燈 / MyGO!!!!!
            <br />
            <span className="text-sm">即使是迷路的孩子,只要继续向前走就好。</span>
          </p>
          <Link
            to="/characters/tomori"
            className="mt-7 inline-flex items-center gap-2 px-5 py-3 bg-[var(--color-ink)] text-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded-md font-bold text-sm shadow-[var(--shadow-stamp-sm)]"
          >
            <Play size={16} /> 查看角色页
          </Link>
        </div>
      </section>

      {/* ========== SISTER SITE ========== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="relative p-6 sm:p-10 bg-[var(--color-forest)] text-[var(--color-cream)] border-[2.5px] border-[var(--color-ink)] rounded-md overflow-hidden">
          <div className="absolute -top-10 -right-10 text-[180px] sm:text-[220px] font-[var(--font-display)] opacity-10 leading-none select-none">
            Moe!
          </div>
          <div className="relative max-w-2xl">
            <Stamp color="var(--color-amber)">SISTER SITE</Stamp>
            <h3 className="font-[var(--font-display)] text-3xl sm:text-5xl mt-4 leading-[1.05]">
              pjsk.moe<br />
              <span className="text-[var(--color-amber)]">MoeSekai</span> 出品.
            </h3>
            <p className="font-[var(--font-jp)] text-base sm:text-lg mt-4 leading-relaxed opacity-95">
              我们已经为 Project Sekai 做了新一代 viewer, 现在把同样的爱带给 bangdream ournotes。
              Moenotes 和 pjsk.moe 共享设计语言、数据结构和社区。
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <a
                href="https://pjsk.moe"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-cream)] text-[var(--color-ink)] border-2 border-[var(--color-ink)] rounded font-bold text-sm hover:bg-[var(--color-amber)]"
              >
                <Star size={16} /> 访问 pjsk.moe
              </a>
              <Link
                to="/about"
                className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-[var(--color-cream)] rounded font-bold text-sm hover:bg-[var(--color-cream)]/10"
              >
                关于 Moenotes →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}



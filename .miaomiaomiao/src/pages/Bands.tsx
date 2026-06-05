import { Link } from "react-router-dom";
import { bands, getBandMembers, songs } from "../data/bands";
import { SectionTitle, FadeIn } from "../components/UI";
import { memberEmoji } from "../utils/emoji";
import { ArrowRight, Music, Mic2 } from "lucide-react";
import { cn } from "../utils/cn";

export default function Bands() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <SectionTitle
        eyebrow="Our Bands"
        title={<>5 支乐队 .</>}
        subtitle="5 つの音、5 つの物語 ── MyGO!!!!!、Ave Mujica、夢限大みゅーたいぷ、millsage、一家Dumb Rock!"
      />

      <div className="space-y-8 sm:space-y-12">
        {bands.map((b, i) => {
          const members = getBandMembers(b.key);
          const bandSongs = songs.filter((s) => s.band === b.key);
          const isReversed = i % 2 === 1;

          return (
            <FadeIn key={b.key}>
              <Link
                to={`/bands/${b.key}`}
                className={cn(
                  "group block grid lg:grid-cols-12 gap-0 lg:gap-6 border-[2.5px] border-[var(--color-ink)] rounded-lg overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-stamp-lg)] transition-all bg-[var(--color-paper)]"
                )}
              >
                {/* Hero panel */}
                <div
                  className={cn(
                    "relative p-6 sm:p-9 text-[var(--color-cream)] overflow-hidden lg:col-span-5 min-h-[260px] flex flex-col justify-between",
                    isReversed && "lg:order-2"
                  )}
                  style={{ background: `linear-gradient(135deg, ${b.color} 0%, ${b.accent} 100%)` }}
                >
                  <div className="absolute inset-0 stripes-cream opacity-25" />
                  <div className="absolute -bottom-12 -right-12 w-48 h-48 rounded-full opacity-15 bg-[var(--color-cream)]" />
                  <div className="absolute inset-0 halftone opacity-15 text-white" />

                  <div className="relative">
                    <div className="font-[var(--font-hand)] text-2xl opacity-90">
                      ── {b.formed} ──
                    </div>
                    <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl mt-1 leading-[0.95]">
                      {b.name}
                    </h2>
                    <p className="font-[var(--font-jp)] text-base sm:text-lg mt-2 italic opacity-95">
                      {b.slogan}
                    </p>
                  </div>

                  <div className="relative flex items-center justify-between text-sm font-[var(--font-jp)] pt-5 border-t-2 border-[var(--color-cream)]/30 mt-5">
                    <div className="flex items-center gap-1.5"><Music size={14} /> {b.song}</div>
                    <div className="inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      详情 <ArrowRight size={14} />
                    </div>
                  </div>
                </div>

                {/* Members panel */}
                <div className="lg:col-span-7 p-5 sm:p-7 bg-[var(--color-paper)]">
                  <div className="font-[var(--font-display)] text-sm tracking-wider text-[var(--color-tomato)] mb-3 flex items-center gap-2">
                    <Mic2 size={14} /> MEMBERS · {members.length}
                  </div>
                  <p className="font-[var(--font-jp)] text-sm sm:text-[15px] text-[var(--color-ink-soft)] leading-relaxed mb-5">
                    {b.concept}
                  </p>

                  <div className="grid grid-cols-5 gap-2 sm:gap-3">
                    {members.map((m, j) => (
                      <div
                        key={m.id}
                        className="relative aspect-[3/4] rounded border-[2px] border-[var(--color-ink)] overflow-hidden"
                        style={{ transform: `rotate(${j % 2 ? -2 : 2}deg)` }}
                      >
                        <div className={cn("absolute inset-0 bg-gradient-to-br", m.bgGradient)} />
                        <div className="absolute inset-0 halftone opacity-25 text-white" />
                        <div className="absolute inset-0 grid place-items-center text-[44px] sm:text-[60px]">
                          {memberEmoji(m.id)}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 px-1 py-1 bg-[var(--color-cream)] border-t-[2px] border-[var(--color-ink)] text-center">
                          <div className="font-[var(--font-jp)] font-bold text-[10px] sm:text-xs truncate">{m.nameJa.split(" ")[1] || m.nameJa}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <span className="font-[var(--font-jp)] text-xs text-[var(--color-ink-soft)] flex items-center gap-1">
                      <Music size={12} /> 收录曲 · {bandSongs.length} 首
                    </span>
                  </div>
                </div>
              </Link>
            </FadeIn>
          );
        })}
      </div>
    </div>
  );
}



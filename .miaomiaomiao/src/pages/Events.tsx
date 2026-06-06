import { useState } from "react";
import { events, getBand } from "../data/bands";
import { SectionTitle, FadeIn, Tag } from "../components/UI";
import { Calendar, CalendarDays, Film, MapPin, Mic, Music, Users } from "lucide-react";
import { cn } from "../utils/cn";

const TABS = [
  { key: "upcoming", label: "即将开始" },
  { key: "live", label: "进行中" },
  { key: "ended", label: "已结束" },
  { key: "all", label: "全部" },
] as const;

const TYPE_ICON = {
  Live: Mic,
  "Fan Meeting": Users,
  新曲: Music,
  PV: Film,
  活动: CalendarDays,
};

export default function Events() {
  const [tab, setTab] = useState<"upcoming" | "live" | "ended" | "all">("upcoming");
  const list = tab === "all" ? events : events.filter((e) => e.status === tab);

  const upcoming = events.filter((e) => e.status === "upcoming");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <SectionTitle
        eyebrow="Live Schedule"
        title={<>活动日程 .</>}
        subtitle={`Live、Fan Meeting、新曲发售 ── 不错过每一场。共 ${events.length} 场活动。`}
      />

      {/* Hero upcoming card */}
      {tab === "upcoming" && upcoming[0] && (
        <FadeIn>
          <div className="mb-8 relative p-6 sm:p-10 border-[2.5px] border-[var(--color-ink)] rounded-md overflow-hidden text-[var(--color-cream)]"
            style={{ background: `linear-gradient(135deg, ${getBand(upcoming[0].band!)?.color || "var(--color-tomato)"} 0%, var(--color-ink) 100%)` }}
          >
            <div className="absolute inset-0 stripes-cream opacity-20" />
            <div className="absolute inset-0 halftone opacity-15 text-white" />
            <div className="absolute top-4 right-4">
              <div className="px-3 py-1 bg-[var(--color-amber)] text-[var(--color-ink)] border-2 border-[var(--color-ink)] rounded font-[var(--font-display)] text-xs tracking-wider">
                FEATURED
              </div>
            </div>
            <div className="relative">
              <div className="font-[var(--font-hand)] text-2xl">next up ──</div>
              <h2 className="font-[var(--font-display)] text-3xl sm:text-5xl mt-2 leading-tight">
                {upcoming[0].title}
              </h2>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm font-[var(--font-jp)]">
                <span className="flex items-center gap-1.5"><Calendar size={16} /> {upcoming[0].date}</span>
                {upcoming[0].location && (
                  <span className="flex items-center gap-1.5"><MapPin size={16} /> {upcoming[0].location}</span>
                )}
                {upcoming[0].band && (
                  <Tag color={getBand(upcoming[0].band)!.color}>
                    {getBand(upcoming[0].band)!.name}
                  </Tag>
                )}
              </div>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 border-[2.5px] border-[var(--color-ink)] rounded-full font-[var(--font-jp)] font-bold text-sm transition-all",
              tab === t.key
                ? "bg-[var(--color-ink)] text-[var(--color-cream)] shadow-[var(--shadow-stamp-sm)]"
                : "bg-[var(--color-cream)] hover:shadow-[2px_2px_0_0_var(--color-ink)]"
            )}
            style={{ transform: tab === t.key ? "rotate(-1deg)" : "rotate(0.5deg)" }}
          >
            {t.label} ({t.key === "all" ? events.length : events.filter((e) => e.status === t.key).length})
          </button>
        ))}
      </div>

      {/* Events list */}
      <div className="space-y-3">
        {list.map((e, i) => {
          const b = e.band ? getBand(e.band) : null;
          const TypeIcon = TYPE_ICON[e.type] || CalendarDays;
          return (
            <FadeIn key={e.id} delay={i * 0.05}>
              <div
                className="grid sm:grid-cols-12 gap-3 sm:gap-4 items-center p-3 sm:p-4 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-stamp-sm)] hover:shadow-[var(--shadow-stamp)] transition-all"
                style={{ transform: `rotate(${i % 2 ? 0.5 : -0.5}deg)` }}
              >
                <div className="sm:col-span-2 flex sm:flex-col items-center sm:items-start gap-2 sm:gap-0">
                  <div
                    className="w-14 h-14 sm:w-16 sm:h-16 grid place-items-center border-[2.5px] border-[var(--color-ink)] rounded text-2xl"
                    style={{ background: b ? b.color : "var(--color-cocoa)" }}
                  >
                    <TypeIcon size={28} strokeWidth={2.4} className="text-[var(--color-cream)]" />
                  </div>
                </div>
                <div className="sm:col-span-7 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <Tag color="var(--color-ink)">{e.type}</Tag>
                    {b && <Tag color={b.color}>{b.name}</Tag>}
                    {e.status === "live" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--color-tomato)] text-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded-sm text-xs font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
                      </span>
                    )}
                    {e.status === "ended" && <Tag color="var(--color-ink-soft)">已结束</Tag>}
                  </div>
                  <h3 className="font-[var(--font-jp)] font-bold text-base sm:text-lg leading-snug">{e.title}</h3>
                  {e.location && (
                    <div className="text-xs text-[var(--color-ink-soft)] mt-1 flex items-center gap-1">
                      <MapPin size={11} /> {e.location}
                    </div>
                  )}
                </div>
                <div className="sm:col-span-3 text-left sm:text-right">
                  <div className="font-[var(--font-display)] text-2xl sm:text-3xl tracking-tight">{e.date.split(".")[2]}</div>
                  <div className="font-[var(--font-jp)] text-xs text-[var(--color-ink-soft)]">
                    {e.date.split(".")[0]}.{e.date.split(".")[1]} · {weekday(e.date)}
                  </div>
                </div>
              </div>
            </FadeIn>
          );
        })}
        {list.length === 0 && (
          <div className="py-20 text-center">
            <div className="font-[var(--font-hand)] text-3xl text-[var(--color-cocoa)]">暂无该分类的活动</div>
          </div>
        )}
      </div>
    </div>
  );
}

function weekday(date: string): string {
  const d = new Date(date);
  const w = ["日", "月", "火", "水", "木", "金", "土"];
  return `${w[d.getDay()]}曜`;
}

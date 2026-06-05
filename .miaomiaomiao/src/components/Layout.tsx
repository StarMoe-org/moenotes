import { NavLink, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Guitar, Music2, Mic2, Sparkles, Headphones, Calendar, Wrench, Info } from "lucide-react";
import { cn } from "../utils/cn";

const links = [
  { to: "/", label: "首页", icon: Sparkles },
  { to: "/characters", label: "角色", icon: Mic2 },
  { to: "/bands", label: "乐队", icon: Guitar },
  { to: "/cards", label: "卡牌", icon: Music2 },
  { to: "/songs", label: "歌曲", icon: Headphones },
  { to: "/events", label: "活动", icon: Calendar },
  { to: "/tools", label: "工具", icon: Wrench },
  { to: "/about", label: "关于", icon: Info },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [loc.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ===== Top marquee ===== */}
      <div className="overflow-hidden bg-[var(--color-ink)] text-[var(--color-cream)] py-2 text-xs sm:text-sm">
        <div className="marquee-track flex gap-12 whitespace-nowrap font-[var(--font-jp)] font-bold tracking-wide">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-12 shrink-0">
              {[
                "★ Moenotes 公开测试中 v0.3",
                "🎸 收录 5 支乐队 / 25 名角色",
                "🎤 Ave Mujica 5th Live 7/19 售票",
                "🆕 卡牌图鉴栏目上线",
                "💌 wiki 公开编辑 · 欢迎补充",
                "⚡ by MoeSekai · pjsk.moe 兄弟站",
              ].map((t, j) => (
                <span key={j} className="shrink-0">· {t} ·</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ===== Navbar ===== */}
      <header
        className={cn(
          "sticky top-0 z-50 transition-all",
          scrolled
            ? "bg-[var(--color-cream)]/95 backdrop-blur shadow-[0_4px_0_0_var(--color-ink)]"
            : "bg-[var(--color-cream)] border-b-2 border-[var(--color-ink)]"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 sm:gap-3 group">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-[var(--color-tomato)] border-[2.5px] border-[var(--color-ink)] rounded-md grid place-items-center text-[var(--color-cream)] font-[var(--font-display)] text-lg shadow-[var(--shadow-stamp-sm)] group-hover:rotate-[-4deg] transition-transform">
              M!
            </div>
            <div className="leading-none">
              <div className="font-[var(--font-display)] text-xl sm:text-2xl tracking-tight">Moenotes</div>
              <div className="font-[var(--font-hand)] text-xs sm:text-sm text-[var(--color-cocoa)] -mt-0.5">
                bangdream ournotes viewer
              </div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "nav-link px-3 py-2 font-[var(--font-jp)] font-bold text-sm",
                    "hover:text-[var(--color-tomato)]",
                    isActive ? "active text-[var(--color-tomato)]" : "text-[var(--color-ink)]"
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2">
            <a
              href="https://pjsk.moe"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold text-[var(--color-ink)]/60 hover:text-[var(--color-tomato)] transition"
            >
              ← pjsk.moe
            </a>
            <Link
              to="/tools"
              className="px-4 py-2 bg-[var(--color-tomato)] text-[var(--color-cream)] border-2 border-[var(--color-ink)] shadow-[var(--shadow-stamp-sm)] hover:shadow-[2px_2px_0_0_var(--color-ink)] hover:translate-x-[1px] hover:translate-y-[1px] font-bold text-sm rounded"
            >
              GACHA
            </Link>
          </div>

          <button
            className="lg:hidden p-2 border-2 border-[var(--color-ink)] rounded"
            onClick={() => setOpen((s) => !s)}
            aria-label="菜单"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* mobile menu */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t-2 border-[var(--color-ink)] bg-[var(--color-cream-deep)] overflow-hidden"
            >
              <div className="px-4 py-3 grid grid-cols-2 gap-2">
                {links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === "/"}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 px-3 py-2.5 border-2 border-[var(--color-ink)] rounded font-bold text-sm",
                        isActive
                          ? "bg-[var(--color-tomato)] text-[var(--color-cream)]"
                          : "bg-[var(--color-cream)]"
                      )
                    }
                  >
                    <l.icon size={16} /> {l.label}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-20 bg-[var(--color-ink)] text-[var(--color-cream)] border-t-4 border-[var(--color-tomato)]">
        <div className="max-w-7xl mx-auto px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 bg-[var(--color-tomato)] border-2 border-[var(--color-cream)] rounded grid place-items-center font-[var(--font-display)] text-sm">
                M!
              </div>
              <div className="font-[var(--font-display)] text-lg">Moenotes</div>
            </div>
            <p className="text-sm text-[var(--color-cream)]/70 font-[var(--font-jp)] leading-relaxed">
              bangdream ournotes 的新一代 viewer · 由 MoeSekai 团队独立运营
            </p>
          </div>
          <div>
            <div className="font-[var(--font-display)] text-sm mb-3 text-[var(--color-amber)]">EXPLORE</div>
            <ul className="space-y-1.5 text-sm font-[var(--font-jp)]">
              {links.slice(0, 4).map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="hover:text-[var(--color-amber)]">
                    → {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-[var(--font-display)] text-sm mb-3 text-[var(--color-amber)]">SISTER</div>
            <ul className="space-y-1.5 text-sm font-[var(--font-jp)]">
              <li><a href="https://pjsk.moe" target="_blank" rel="noreferrer" className="hover:text-[var(--color-amber)]">→ pjsk.moe (MoeSekai)</a></li>
              <li><a href="https://sekai.best" target="_blank" rel="noreferrer" className="hover:text-[var(--color-amber)]">→ sekai.best</a></li>
              <li><a href="https://bestdori.com" target="_blank" rel="noreferrer" className="hover:text-[var(--color-amber)]">→ bestdori.com</a></li>
            </ul>
          </div>
          <div>
            <div className="font-[var(--font-display)] text-sm mb-3 text-[var(--color-amber)]">CONTACT</div>
            <ul className="space-y-1.5 text-sm font-[var(--font-jp)]">
              <li>📮 提交反馈 / 投稿</li>
              <li>🐛 错误报告</li>
              <li>💌 邮箱 admin@moenotes.moe</li>
              <li className="text-[var(--color-cream)]/50 text-xs pt-2">© 2025 Moenotes · 非官方资料站</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[var(--color-cream)]/15 py-4 text-center text-xs text-[var(--color-cream)]/50 font-[var(--font-jp)]">
          本站为粉丝自建资料站,与 Bushiroad / Craft Egg / Ishimori 官方无任何关联。
        </div>
      </footer>
    </div>
  );
}

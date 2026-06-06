import { Link } from "react-router-dom";
import { SectionTitle, FadeIn, Tag, Stamp } from "../components/UI";
import { Heart, Mail, Sparkles, Music, Users, Code2 } from "lucide-react";

export default function About() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <SectionTitle
        eyebrow="About Us"
        title={<>关于 Moenotes .</>}
      />

      <FadeIn>
        <div className="mb-10 p-6 sm:p-10 bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md shadow-[var(--shadow-card)] relative">
          <div className="absolute -top-3 -left-3"><Stamp color="var(--color-tomato)">建立于 2025</Stamp></div>

          <p className="font-[var(--font-jp)] text-base sm:text-lg leading-relaxed text-[var(--color-ink-soft)]">
            Moenotes 是由 <span className="font-bold text-[var(--color-tomato)]">MoeSekai</span> 团队独立运营的
            <span className="hand-underline font-bold"> bangdream ournotes </span>
            粉丝资料站。我们已经为 Project Sekai 做了新一代 viewer「pjsk.moe」, 现在把同样的爱带给 ournotes。
          </p>

          <div className="mt-6 grid sm:grid-cols-3 gap-3">
            <Feature icon={Heart} title="粉丝自营" desc="非官方、纯粉丝项目" />
            <Feature icon={Sparkles} title="现代化" desc="基于 React + Vite 的快速体验" />
            <Feature icon={Users} title="公开编辑" desc="欢迎社区投稿数据" />
          </div>
        </div>
      </FadeIn>

      <FadeIn>
        <h3 className="font-[var(--font-display)] text-2xl sm:text-3xl mb-4">设计理念 .</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-5 bg-[var(--color-amber)] border-[2.5px] border-[var(--color-ink)] rounded-md">
            <div className="font-[var(--font-hand)] text-2xl text-[var(--color-ink)] mb-1">why retro-zine?</div>
            <p className="text-sm font-[var(--font-jp)] leading-relaxed">
              bangdream 的灵魂是 <span className="font-bold">青春 × 摇滚 × Livehouse</span>。
              我们用 Zine（杂志小册）+ 复古印刷的元素来呈现这种感觉 ── 撕边、胶带、手写体、邮票、暖色调。
            </p>
          </div>
          <div className="p-5 bg-[var(--color-mint)] border-[2.5px] border-[var(--color-ink)] rounded-md">
            <div className="font-[var(--font-hand)] text-2xl text-[var(--color-ink)] mb-1">sister site</div>
            <p className="text-sm font-[var(--font-jp)] leading-relaxed">
              与 pjsk.moe 共享设计语言 ── 但在视觉上做了差异化（pjsk 走粉紫清新, Moenotes 走暖橘摇滚）。
              两个站点是一个团队做的, 一个 DNA 两种风格。
            </p>
          </div>
        </div>
      </FadeIn>

      <FadeIn>
        <h3 className="font-[var(--font-display)] text-2xl sm:text-3xl mt-10 mb-4">技术栈 .</h3>
        <div className="flex flex-wrap gap-2">
          {["React 19", "TypeScript", "Vite 7", "Tailwind 4", "Framer Motion", "Lucide Icons", "React Router 7"].map((t) => (
            <span key={t} className="px-3 py-1.5 border-2 border-[var(--color-ink)] rounded-full bg-[var(--color-cream)] text-sm font-bold font-[var(--font-jp)]">
              <Tag color="var(--color-cream-deep)">{t}</Tag>
            </span>
          ))}
        </div>
      </FadeIn>

      <FadeIn>
        <h3 className="font-[var(--font-display)] text-2xl sm:text-3xl mt-10 mb-4">加入我们 .</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <a className="p-4 bg-[var(--color-ink)] text-[var(--color-cream)] border-[2.5px] border-[var(--color-ink)] rounded-md flex items-center gap-3 hover:bg-[var(--color-tomato)] transition-colors" href="https://github.com/moe-sekai" target="_blank" rel="noreferrer">
            <Code2 size={22} />
            <div>
              <div className="font-[var(--font-display)] tracking-wider">GITHUB</div>
              <div className="text-xs opacity-80 font-[var(--font-jp)]">@moe-sekai</div>
            </div>
          </a>
          <a className="p-4 bg-[var(--color-forest)] text-[var(--color-cream)] border-[2.5px] border-[var(--color-ink)] rounded-md flex items-center gap-3 hover:bg-[var(--color-tomato)] transition-colors" href="https://pjsk.moe" target="_blank" rel="noreferrer">
            <Music size={22} />
            <div>
              <div className="font-[var(--font-display)] tracking-wider">PJSK.MOE</div>
              <div className="text-xs opacity-80 font-[var(--font-jp)]">姐妹站</div>
            </div>
          </a>
          <a className="p-4 bg-[var(--color-cocoa)] text-[var(--color-cream)] border-[2.5px] border-[var(--color-ink)] rounded-md flex items-center gap-3 hover:bg-[var(--color-tomato)] transition-colors" href="mailto:admin@moenotes.moe">
            <Mail size={22} />
            <div>
              <div className="font-[var(--font-display)] tracking-wider">EMAIL</div>
              <div className="text-xs opacity-80 font-[var(--font-jp)]">admin@moenotes.moe</div>
            </div>
          </a>
        </div>
      </FadeIn>

      <FadeIn>
        <div className="mt-12 p-6 sm:p-8 bg-[var(--color-cream-deep)] border-2 border-dashed border-[var(--color-ink)] rounded-md text-center">
          <div className="font-[var(--font-hand)] text-2xl text-[var(--color-tomato)]">免责声明</div>
          <p className="text-sm font-[var(--font-jp)] text-[var(--color-ink-soft)] mt-3 leading-relaxed">
            本网站为粉丝自建资料站, 与 Bushiroad / Craft Egg / Ishimori Production / 武士道 等官方公司无任何关联。<br />
            站内所有数据来源于公开资料整理, 如有错误欢迎指正。所有角色 / 乐队 / 歌曲的著作权归其各自权利人所有。
          </p>
        </div>
      </FadeIn>

      <div className="mt-10 text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-3 bg-[var(--color-tomato)] text-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded-md font-bold shadow-[var(--shadow-stamp)] hover:shadow-[var(--shadow-stamp-sm)] hover:translate-x-[1px] hover:translate-y-[1px]"
        >
          ← 回到首页
        </Link>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: any) {
  return (
    <div className="p-3 bg-[var(--color-cream)] border-2 border-[var(--color-ink)] rounded-md">
      <Icon size={20} className="text-[var(--color-tomato)]" />
      <div className="font-[var(--font-display)] text-base mt-1.5">{title}</div>
      <div className="text-xs text-[var(--color-ink-soft)] font-[var(--font-jp)]">{desc}</div>
    </div>
  );
}

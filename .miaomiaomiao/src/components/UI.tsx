// 可复用的小组件 — 通用 UI 元件
import { cn } from "../utils/cn";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { SparkleIcon, StarIcon } from "./Placeholders";

export function Stamp({ children, color = "var(--color-tomato)", className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-3 py-1 border-2 border-[var(--color-ink)] font-[var(--font-display)] tracking-wider text-xs sm:text-sm rounded-sm",
        className
      )}
      style={{ background: color, color: "var(--color-cream)", transform: "rotate(-3deg)" }}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6 sm:mb-8">
      <div>
        {eyebrow && (
          <div className="font-[var(--font-hand)] text-[var(--color-tomato)] text-lg sm:text-xl -mb-1">
            <SparkleIcon className="w-4 h-4" /> {eyebrow}
          </div>
        )}
        <h2 className="font-[var(--font-display)] text-3xl sm:text-5xl tracking-tight text-[var(--color-ink)] leading-[1.05]">
          {title}
        </h2>
        {subtitle && (
          <p className="font-[var(--font-jp)] text-sm sm:text-base text-[var(--color-ink-soft)] mt-2 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

export function StickerCard({
  children,
  className,
  rotate = 0,
  tape = false,
  href,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  rotate?: number;
  tape?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div
      className={cn(
        "relative bg-[var(--color-paper)] border-[2.5px] border-[var(--color-ink)] rounded-md",
        "shadow-[var(--shadow-card)]",
        tape && "tape",
        className
      )}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </div>
  );
  if (href) return <a href={href} className="block hover:scale-[1.02] transition-transform">{inner}</a>;
  if (onClick) return <button onClick={onClick} className="block w-full text-left hover:scale-[1.02] transition-transform">{inner}</button>;
  return inner;
}

export function Tag({ children, color = "var(--color-paper)" }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 border-2 border-[var(--color-ink)] text-xs font-bold font-[var(--font-jp)] rounded-sm"
      style={{ background: color, color: "var(--color-ink)" }}
    >
      {children}
    </span>
  );
}

// 各种稀有度的卡牌背景
export const rarityBg = (r: number) => {
  switch (r) {
    case 5: return "linear-gradient(135deg, #F4C430 0%, #E84D2E 60%, #6B2B5E 100%)";
    case 4: return "linear-gradient(135deg, #F4A93C 0%, #C8412B 100%)";
    case 3: return "linear-gradient(135deg, #7FB069 0%, #4A8FA8 100%)";
    case 2: return "linear-gradient(135deg, #B0A8C2 0%, #6B8E9E 100%)";
    default: return "linear-gradient(135deg, #E5DCC8 0%, #B0A899 100%)";
  }
};

export const attributeColor = (a: string) => {
  switch (a) {
    case "Power": return "#E84D2E";
    case "Cool":  return "#4A8FA8";
    case "Pure":  return "#E89BA8";
    case "Happy": return "#F4C430";
    case "Dark":  return "#2A1B3D";
    default: return "#6B4423";
  }
};

export function FadeIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: [0.2, 0.9, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 my-8">
      <div className="flex-1 h-[2px] bg-[var(--color-ink)]" />
      <StarIcon className="w-4 h-4 text-[var(--color-ink)]" />
      <div className="flex-1 h-[2px] bg-[var(--color-ink)]" />
    </div>
  );
}

export function CornerDecor() {
  return (
    <svg
      className="absolute -top-1 -left-1 w-6 h-6 text-[var(--color-tomato)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M3 8 L3 3 L8 3" />
    </svg>
  );
}

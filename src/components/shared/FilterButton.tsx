import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useSpringAnimation } from "@/lib/animation/use-animation";

export interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  activeBg?: string;
  activeColor?: string;
  children: ReactNode;
}

export default function FilterButton({
  active,
  onClick,
  activeBg,
  activeColor,
  children,
}: FilterButtonProps) {
  const { floatTapProps, floatHoverProps, springTransition } = useSpringAnimation();
  const motionProps = { ...floatHoverProps, ...floatTapProps };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...motionProps}
      transition={springTransition}
      className={[
        "mn-filter-chip relative rounded-lg border border-[var(--mn-border)] px-3 py-1.5",
        "text-xs font-bold transition-colors sm:text-sm",
        active
          ? "text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]"
          : "bg-[var(--mn-paper)] hover:shadow-[var(--mn-shadow-stamp-sm)]",
      ].join(" ")}
      style={{
        background: active ? (activeBg ?? "var(--mn-accent-deep)") : undefined,
        color: active ? (activeColor ?? "var(--mn-bg)") : undefined,
      }}
    >
      {children}
    </motion.button>
  );
}

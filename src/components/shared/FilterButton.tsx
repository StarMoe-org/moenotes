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
  // Capsule / pill button → float animation (rise + slight rotate)
  const { floatHoverProps, floatTapProps, springTransition } = useSpringAnimation();

  return (
    <motion.button
      onClick={onClick}
      {...floatHoverProps}
      {...floatTapProps}
      transition={springTransition}
      className={[
        "relative rounded-full border-2 border-[var(--mn-border)] px-3 py-1.5",
        "text-xs font-bold transition-colors sm:text-sm",
        active
          ? "text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]"
          : "bg-[var(--mn-paper)] hover:shadow-[var(--mn-shadow-stamp-sm)]",
      ].join(" ")}
      style={{
        background: active ? (activeBg ?? "var(--mn-accent-deep)") : undefined,
        color: active ? (activeColor ?? "var(--mn-bg)") : undefined,
        transform: active ? "rotate(-1deg)" : "rotate(0.5deg)",
      }}
    >
      {children}
    </motion.button>
  );
}

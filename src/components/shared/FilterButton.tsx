"use client";

import type { CSSProperties, ReactNode } from "react";

export interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  /** A content color (e.g. an attribute or band color) for the selected state instead of primary-container. */
  activeBg?: string;
  activeColor?: string;
  children: ReactNode;
}

/**
 * Material 3 filter chip (32dp, small shape), as MoeSekai fills it: surface-container-high when off, the seed's
 * primary-container when selected, with no check mark. Plain CSS (`.md3-filter-chip`), since filter panels render
 * dozens of them.
 */
export default function FilterButton({ active, onClick, activeBg, activeColor, children }: FilterButtonProps) {
  const style: CSSProperties | undefined = active && activeBg ? { background: activeBg, color: activeColor ?? "var(--md-sys-color-on-primary)", borderColor: "transparent" } : undefined;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="md3-filter-chip md3-state" style={style}>
      {children}
    </button>
  );
}

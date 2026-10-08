interface Props {
  label: string;
  /** Tailwind position classes; top right keeps clear of the attribute icon on card artwork. */
  position?: string;
}

/** Overlay tag on list-card artwork. */
export default function ListCardBadge({ label, position = "right-2 top-2" }: Props) {
  return (
    <span className={`pointer-events-none absolute z-10 rounded-full bg-[var(--md-sys-color-primary)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-level1)] ring-1 ring-[var(--md-sys-color-surface)] ${position}`}>
      {label}
    </span>
  );
}

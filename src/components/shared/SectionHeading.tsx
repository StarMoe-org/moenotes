import type { ReactNode } from "react";

interface Props {
  id?: string;
  title: string;
  /** Right-aligned controls such as a "view all" link or a segmented toggle. */
  children?: ReactNode;
}

/** Section title matching the route heading: star, title, orbit track. */
export default function SectionHeading({ id, title, children }: Props) {
  return (
    <div className="mn-section-heading">
      <svg className="mn-section-heading-star" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" stroke="currentColor" strokeWidth="1.4" /></svg>
      <h2 id={id}>{title}</h2>
      <span className="mn-section-heading-track" aria-hidden="true" />
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

interface LinkProps {
  href: string;
  label: string;
}

export function SectionLink({ href, label }: LinkProps) {
  return (
    <a
      href={href}
      className="mn-focus inline-flex items-center gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] px-3 py-1.5 text-xs font-bold text-[var(--mn-accent-deep)] hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)]"
    >
      {label}
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
    </a>
  );
}

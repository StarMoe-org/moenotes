"use client";

import type { ReactNode } from "react";

/** A detail page's facts: a label on the left, the value on the right, one per row. */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="md3-surface divide-y divide-outline-variant px-6 sm:px-8">{children}</dl>;
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5 text-body-large">
      <dt className="shrink-0 text-on-surface-variant">{label}</dt>
      <dd className="m-0 min-w-0 text-right text-on-surface">{value}</dd>
    </div>
  );
}

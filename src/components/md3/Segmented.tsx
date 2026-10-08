import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { md3Cx, md3SegmentClass } from "@/lib/md3/classes";

export interface MdSegmentedProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
  children?: ReactNode;
}

/** M3 segmented button group (single- or multi-select, controlled by the caller). */
export function MdSegmented({ label, role = "group", className, children, ...rest }: MdSegmentedProps) {
  return (
    <div role={role} aria-label={label} className={md3Cx("md3-segmented", className)} {...rest}>
      {children}
    </div>
  );
}

export interface MdSegmentProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function MdSegment({ selected = false, icon, className, children, ...rest }: MdSegmentProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={md3Cx(md3SegmentClass(selected), className)}
      {...rest}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}

import type { CSSProperties, HTMLAttributes } from "react";
import { md3Cx } from "@/lib/md3/classes";

export interface MdLinearProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0..1; omitted renders the indeterminate animation. */
  value?: number | null;
}

/** M3 linear progress indicator. */
export function MdLinearProgress({ value = null, className, ...rest }: MdLinearProgressProps) {
  const determinate = typeof value === "number" && Number.isFinite(value);
  const clamped = determinate ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(clamped * 100) : undefined}
      className={md3Cx("md3-linear-progress", !determinate && "md3-linear-progress--indeterminate", className)}
      {...rest}
    >
      <div className="md3-linear-progress__bar" style={determinate ? { width: `${clamped * 100}%` } : undefined} />
    </div>
  );
}

export interface MdCircularProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0..1; omitted renders the indeterminate animation. */
  value?: number | null;
}

/** M3 circular progress indicator. */
export function MdCircularProgress({ value = null, className, style, ...rest }: MdCircularProgressProps) {
  const determinate = typeof value === "number" && Number.isFinite(value);
  const clamped = determinate ? Math.min(1, Math.max(0, value)) : 0;
  const merged: CSSProperties = determinate
    ? { ...style, "--md-progress": clamped } as CSSProperties
    : (style ?? {});
  return (
    <div
      role="progressbar"
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(clamped * 100) : undefined}
      className={md3Cx("md3-circular-progress", !determinate && "md3-circular-progress--indeterminate", className)}
      style={merged}
      {...rest}
    />
  );
}

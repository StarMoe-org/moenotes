import type { HTMLAttributes, ReactNode } from "react";
import { md3Cx } from "@/lib/md3/classes";

export interface MdBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Count label; omitted renders the small dot badge. */
  count?: number | string;
  max?: number;
  children?: ReactNode;
}

/**
 * M3 badge. Wrap the anchor in `.md3-badge-anchor` (or MdBadgeAnchor) so the
 * badge offsets from the anchor's top-end corner.
 */
export function MdBadge({ count, max = 999, className, children, ...rest }: MdBadgeProps) {
  const large = count !== undefined || children !== undefined;
  const label =
    children ??
    (typeof count === "number" && count > max ? `${max}+` : count);
  return (
    <span className={md3Cx("md3-badge", large && "md3-badge--large", className)} {...rest}>
      {label}
    </span>
  );
}

export function MdBadgeAnchor({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={md3Cx("md3-badge-anchor", className)} {...rest}>
      {children}
    </span>
  );
}

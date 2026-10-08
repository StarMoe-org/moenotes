import type { HTMLAttributes } from "react";
import { md3Cx } from "@/lib/md3/classes";

export interface MdDividerProps extends HTMLAttributes<HTMLHRElement> {
  inset?: boolean;
}

/** M3 divider. */
export function MdDivider({ inset = false, className, ...rest }: MdDividerProps) {
  return <hr className={md3Cx("md3-divider", inset && "md3-divider--inset", className)} {...rest} />;
}

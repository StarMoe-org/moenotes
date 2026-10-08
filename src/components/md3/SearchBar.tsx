import type { InputHTMLAttributes, ReactNode } from "react";
import { md3Cx } from "@/lib/md3/classes";

export interface MdSearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  leading?: ReactNode;
  trailing?: ReactNode;
  barClassName?: string;
}

/** M3 search bar. */
export function MdSearchBar({ leading, trailing, barClassName, className, ...rest }: MdSearchBarProps) {
  return (
    <div className={md3Cx("md3-search-bar", barClassName)}>
      {leading}
      <input type="search" className={className} {...rest} />
      {trailing}
    </div>
  );
}

import type { HTMLAttributes, ReactNode } from "react";
import { md3Cx } from "@/lib/md3/classes";

export type MdTopAppBarVariant = "small" | "center" | "medium" | "large";

export type MdTopAppBarProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  variant?: MdTopAppBarVariant;
  title?: ReactNode;
  navIcon?: ReactNode;
  actions?: ReactNode;
  /** Collapsing headline for the medium / large variants. */
  headline?: ReactNode;
  /** Set when the page scrolls: tints the container per M3 scroll behavior. */
  scrolled?: boolean;
  children?: ReactNode;
};

/** M3 top app bar (small / center-aligned / medium / large). */
export function MdTopAppBar({
  variant = "small",
  title,
  navIcon,
  actions,
  headline,
  scrolled = false,
  className,
  children,
  ...rest
}: MdTopAppBarProps) {
  const cls = md3Cx(
    "md3-top-app-bar",
    variant === "center" && "md3-top-app-bar--center",
    variant === "medium" && "md3-top-app-bar--medium",
    variant === "large" && "md3-top-app-bar--large",
    scrolled && "md3-top-app-bar--scrolled",
    className,
  );
  return (
    <header className={cls} {...rest}>
      {navIcon}
      {title ? <div className="md3-top-app-bar__title">{title}</div> : null}
      {actions}
      {headline && (variant === "medium" || variant === "large") ? (
        <div className="md3-top-app-bar__headline">{headline}</div>
      ) : null}
      {children}
    </header>
  );
}

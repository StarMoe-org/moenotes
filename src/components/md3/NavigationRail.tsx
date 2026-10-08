import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { md3Cx, md3RailItemClass } from "@/lib/md3/classes";

export interface MdNavigationRailProps extends HTMLAttributes<HTMLElement> {
  top?: ReactNode;
  bottom?: ReactNode;
  children?: ReactNode;
}

/** M3 navigation rail. Menu button / FAB slots via top and bottom. */
export function MdNavigationRail({ top, bottom, className, children, ...rest }: MdNavigationRailProps) {
  return (
    <nav className={md3Cx("md3-nav-rail", className)} {...rest}>
      {top}
      {children}
      {bottom ? <div style={{ marginTop: "auto" }}>{bottom}</div> : null}
    </nav>
  );
}

interface MdRailItemBase {
  icon: ReactNode;
  activeIcon?: ReactNode;
  label: ReactNode;
  active?: boolean;
  className?: string;
}

type MdRailItemProps = MdRailItemBase &
  (
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
    | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
  );

/** M3 navigation rail destination. */
export function MdRailItem({ icon, activeIcon, label, active = false, className, ...rest }: MdRailItemProps) {
  const cls = md3Cx(md3RailItemClass(active), className);
  const content = (
    <>
      <span className="md3-nav-item__indicator" aria-hidden="true">
        {active && activeIcon ? activeIcon : icon}
      </span>
      <span>{label}</span>
    </>
  );
  if ("href" in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest;
    return (
      <a href={href} className={cls} aria-current={active ? "page" : undefined} {...anchorRest}>
        {content}
      </a>
    );
  }
  const { type = "button", ...buttonRest } = rest;
  return (
    <button type={type} className={cls} aria-current={active ? "page" : undefined} {...buttonRest}>
      {content}
    </button>
  );
}

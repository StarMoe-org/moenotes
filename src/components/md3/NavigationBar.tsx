import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { md3Cx, md3NavItemClass } from "@/lib/md3/classes";
import { MdBadgeAnchor } from "./Badge";

export function MdNavigationBar({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <nav className={md3Cx("md3-nav-bar", className)} {...rest}>
      {children}
    </nav>
  );
}

interface MdNavigationBarItemBase {
  icon: ReactNode;
  activeIcon?: ReactNode;
  label: ReactNode;
  badge?: ReactNode;
  active?: boolean;
  className?: string;
}

type MdNavigationBarItemProps = MdNavigationBarItemBase &
  (
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
    | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
  );

/** M3 navigation bar destination. */
export function MdNavigationBarItem({
  icon,
  activeIcon,
  label,
  badge,
  active = false,
  className,
  ...rest
}: MdNavigationBarItemProps) {
  const cls = md3Cx(md3NavItemClass(active), className);
  const content = (
    <>
      <span className="md3-nav-item__indicator">
        <MdBadgeAnchor>
          <span aria-hidden="true">{active && activeIcon ? activeIcon : icon}</span>
          {badge}
        </MdBadgeAnchor>
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

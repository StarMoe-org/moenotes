import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { md3Cx, md3DrawerItemClass } from "@/lib/md3/classes";

export interface MdNavigationDrawerProps extends HTMLAttributes<HTMLElement> {
  modal?: boolean;
  children?: ReactNode;
}

/** M3 navigation drawer container (standard / modal). Modal behavior (scrim, focus) stays with the caller. */
export function MdNavigationDrawer({ modal = false, className, children, ...rest }: MdNavigationDrawerProps) {
  return (
    <nav className={md3Cx("md3-nav-drawer", modal && "md3-nav-drawer--modal", className)} {...rest}>
      {children}
    </nav>
  );
}

export function MdDrawerHeadline({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={md3Cx("md3-drawer-headline", className)} {...rest}>
      {children}
    </h2>
  );
}

interface MdDrawerItemBase {
  icon?: ReactNode;
  badge?: ReactNode;
  active?: boolean;
  className?: string;
  children?: ReactNode;
}

type MdDrawerItemProps = MdDrawerItemBase &
  (
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
    | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
  );

/** M3 navigation drawer destination. */
export function MdDrawerItem({ icon, badge, active = false, className, children, ...rest }: MdDrawerItemProps) {
  const cls = md3Cx(md3DrawerItemClass(active), className);
  const content = (
    <>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
      {badge ? <span className="md3-drawer-item__badge">{badge}</span> : null}
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

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { md3Cx } from "@/lib/md3/classes";

export function MdMenu({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="menu" className={md3Cx("md3-menu", className)} {...rest}>
      {children}
    </div>
  );
}

interface MdMenuItemBase {
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  className?: string;
  children?: ReactNode;
}

type MdMenuItemProps = MdMenuItemBase &
  (
    | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
  );

/** M3 menu item. Positioning stays with the caller's popover/menu container. */
export function MdMenuItem({ leading, trailing, selected = false, className, children, ...rest }: MdMenuItemProps) {
  const cls = md3Cx("md3-menu-item", selected && "md3-menu-item--selected", className);
  const content = (
    <>
      {leading ? <span aria-hidden="true">{leading}</span> : null}
      <span>{children}</span>
      {trailing ? <span className="md3-menu-item__trailing">{trailing}</span> : null}
    </>
  );
  if ("href" in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest;
    return (
      <a role="menuitem" href={href} className={cls} {...anchorRest}>
        {content}
      </a>
    );
  }
  const { type = "button", ...buttonRest } = rest;
  return (
    <button role="menuitem" type={type} className={cls} {...buttonRest}>
      {content}
    </button>
  );
}

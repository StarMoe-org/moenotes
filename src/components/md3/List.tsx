import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { md3Cx } from "@/lib/md3/classes";

export function MdList({ className, children, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={md3Cx("md3-list", className)} {...rest}>
      {children}
    </ul>
  );
}

interface MdListItemBase {
  lines?: 1 | 2 | 3;
  leading?: ReactNode;
  headline?: ReactNode;
  supporting?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children?: ReactNode;
}

type MdListItemProps = MdListItemBase &
  (
    | ({ href?: undefined; onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"] } & Omit<
        ButtonHTMLAttributes<HTMLButtonElement>,
        "onClick"
      >)
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
    | ({ href?: undefined; onClick?: undefined } & HTMLAttributes<HTMLLIElement>)
  );

/** M3 list item (1-3 lines). Interactive items use href (or onClick, rendered as a button). */
export function MdListItem({
  lines = 1,
  leading,
  headline,
  supporting,
  trailing,
  className,
  children,
  ...rest
}: MdListItemProps) {
  const cls = md3Cx(
    "md3-list-item",
    lines === 2 && "md3-list-item--two-line",
    lines === 3 && "md3-list-item--three-line",
    className,
  );
  const content = (
    <>
      {leading ? (
        <span className="md3-list-item__leading" aria-hidden="true">
          {leading}
        </span>
      ) : null}
      <span className="md3-list-item__body">
        {headline ? <span className="md3-list-item__headline">{headline}</span> : null}
        {supporting ? <span className="md3-list-item__supporting">{supporting}</span> : null}
        {children}
      </span>
      {trailing ? <span className="md3-list-item__trailing">{trailing}</span> : null}
    </>
  );
  if ("href" in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest;
    return (
      <a href={href} className={cls} {...anchorRest}>
        {content}
      </a>
    );
  }
  if ("onClick" in rest && rest.onClick !== undefined) {
    const { onClick, type = "button", ...buttonRest } = rest;
    return (
      <button type={type} className={cls} onClick={onClick} {...buttonRest}>
        {content}
      </button>
    );
  }
  return (
    <li className={cls} {...(rest as HTMLAttributes<HTMLLIElement>)}>
      {content}
    </li>
  );
}

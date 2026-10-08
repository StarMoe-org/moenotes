import type { AnchorHTMLAttributes, ButtonHTMLAttributes, PointerEventHandler, ReactNode } from "react";
import {
  md3ButtonClass,
  md3Cx,
  type Md3ButtonSize,
  type Md3ButtonVariant,
} from "@/lib/md3/classes";
import { MD_RIPPLE_CLASS, spawnMdRipple } from "@/lib/md3/ripple";

export interface MdButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown"> {
  variant?: Md3ButtonVariant;
  size?: Md3ButtonSize;
  error?: boolean;
  icon?: ReactNode;
  ripple?: boolean;
  /** Renders an anchor instead of a button when set. */
  href?: string;
  onPointerDown?: PointerEventHandler<HTMLElement>;
}

/** M3 common button (elevated / filled / tonal / outlined / text). */
export function MdButton({
  variant = "filled",
  size = "medium",
  error = false,
  icon,
  ripple = true,
  className,
  children,
  href,
  onPointerDown,
  type = "button",
  ...rest
}: MdButtonProps) {
  const cls = md3Cx(
    md3ButtonClass(variant, size),
    error && "md3-button--error",
    ripple && MD_RIPPLE_CLASS,
    className,
  );
  const handlePointerDown: PointerEventHandler<HTMLElement> = (event) => {
    if (ripple) spawnMdRipple(event);
    onPointerDown?.(event);
  };
  const content = (
    <>
      {icon ? (
        <span className="md3-button__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </>
  );
  if (href !== undefined) {
    return (
      <a href={href} className={cls} onPointerDown={handlePointerDown} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} className={cls} onPointerDown={handlePointerDown} {...rest}>
      {content}
    </button>
  );
}

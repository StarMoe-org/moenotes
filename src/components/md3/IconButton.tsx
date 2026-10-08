import type { ButtonHTMLAttributes, PointerEventHandler, ReactNode } from "react";
import { md3Cx, md3IconButtonClass, type Md3IconButtonVariant } from "@/lib/md3/classes";
import { MD_RIPPLE_CLASS, spawnMdRipple } from "@/lib/md3/ripple";

export interface MdIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown"> {
  variant?: Md3IconButtonVariant;
  /** Toggle state; renders aria-pressed and the selected container. */
  selected?: boolean;
  small?: boolean;
  ripple?: boolean;
  children?: ReactNode;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
}

/** M3 icon button (standard / filled / tonal / outlined), optionally a toggle. */
export function MdIconButton({
  variant = "standard",
  selected = false,
  small = false,
  ripple = true,
  className,
  children,
  onPointerDown,
  type = "button",
  ...rest
}: MdIconButtonProps) {
  const cls = md3Cx(
    md3IconButtonClass(variant, selected),
    small && "md3-icon-button--small",
    ripple && MD_RIPPLE_CLASS,
    className,
  );
  const handlePointerDown: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (ripple) spawnMdRipple(event);
    onPointerDown?.(event);
  };
  return (
    <button type={type} className={cls} onPointerDown={handlePointerDown} {...rest}>
      {children}
    </button>
  );
}

import type { ButtonHTMLAttributes, PointerEventHandler, ReactNode } from "react";
import { md3ChipClass, md3Cx } from "@/lib/md3/classes";
import { MD_RIPPLE_CLASS, spawnMdRipple } from "@/lib/md3/ripple";

export interface MdChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown"> {
  selected?: boolean;
  elevated?: boolean;
  icon?: ReactNode;
  ripple?: boolean;
  children?: ReactNode;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
}

/** M3 chip (assist / filter / input / suggestion share the container; selected + elevated vary it). */
export function MdChip({
  selected = false,
  elevated = false,
  icon,
  ripple = true,
  className,
  children,
  onPointerDown,
  type = "button",
  ...rest
}: MdChipProps) {
  const cls = md3Cx(md3ChipClass(selected, elevated), ripple && MD_RIPPLE_CLASS, className);
  const handlePointerDown: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (ripple) spawnMdRipple(event);
    onPointerDown?.(event);
  };
  return (
    <button type={type} className={cls} onPointerDown={handlePointerDown} {...rest}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}

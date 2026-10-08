import type { ButtonHTMLAttributes, PointerEventHandler, ReactNode } from "react";
import { md3Cx, md3FabClass, type Md3FabColor, type Md3FabSize } from "@/lib/md3/classes";
import { MD_RIPPLE_CLASS, spawnMdRipple } from "@/lib/md3/ripple";

export interface MdFabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onPointerDown"> {
  size?: Md3FabSize;
  color?: Md3FabColor;
  extended?: boolean;
  ripple?: boolean;
  children?: ReactNode;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
}

/** M3 floating action button. */
export function MdFab({
  size = "medium",
  color = "surface",
  extended = false,
  ripple = true,
  className,
  children,
  onPointerDown,
  type = "button",
  ...rest
}: MdFabProps) {
  const cls = md3Cx(md3FabClass(size, color), extended && "md3-fab--extended", ripple && MD_RIPPLE_CLASS, className);
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

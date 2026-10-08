import type { InputHTMLAttributes } from "react";
import { md3Cx } from "@/lib/md3/classes";

export interface MdSwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  labelClassName?: string;
}

/** M3 switch. Pair with a visible <label> or an aria-label on the input. */
export function MdSwitch({ labelClassName, className, ...rest }: MdSwitchProps) {
  return (
    <label className={md3Cx("md3-switch", labelClassName)}>
      <input type="checkbox" className={className} {...rest} />
      <span className="md3-switch__track" aria-hidden="true">
        <span className="md3-switch__thumb" />
      </span>
    </label>
  );
}

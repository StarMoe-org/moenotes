import type { InputHTMLAttributes } from "react";
import { md3Cx } from "@/lib/md3/classes";

export interface MdCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  error?: boolean;
  labelClassName?: string;
}

/** M3 checkbox. Set indeterminate via ref; the dash style follows :indeterminate. */
export function MdCheckbox({ error = false, labelClassName, className, ...rest }: MdCheckboxProps) {
  return (
    <label className={md3Cx("md3-checkbox", error && "md3-checkbox--error", labelClassName)}>
      <input type="checkbox" className={className} {...rest} />
      <span className="md3-checkbox__box" aria-hidden="true" />
    </label>
  );
}

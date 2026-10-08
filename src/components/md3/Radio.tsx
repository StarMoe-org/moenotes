import type { InputHTMLAttributes } from "react";
import { md3Cx } from "@/lib/md3/classes";

export interface MdRadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  error?: boolean;
  labelClassName?: string;
}

/** M3 radio button. */
export function MdRadio({ error = false, labelClassName, className, ...rest }: MdRadioProps) {
  return (
    <label className={md3Cx("md3-radio", error && "md3-radio--error", labelClassName)}>
      <input type="radio" className={className} {...rest} />
      <span className="md3-radio__dot" aria-hidden="true" />
    </label>
  );
}

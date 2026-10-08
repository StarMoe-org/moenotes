import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { md3Cx } from "@/lib/md3/classes";

interface MdTextFieldBase {
  label: ReactNode;
  supporting?: ReactNode;
  error?: boolean;
  outlined?: boolean;
  className?: string;
}

export type MdTextFieldProps = MdTextFieldBase &
  (
    | ({ multiline?: false } & InputHTMLAttributes<HTMLInputElement>)
    | ({ multiline: true } & TextareaHTMLAttributes<HTMLTextAreaElement>)
  );

/**
 * M3 text field (filled / outlined) with floating label.
 * The label floats when the control is focused or non-empty (placeholder=" "
 * is set internally for :placeholder-shown tracking; do not override it).
 */
export function MdTextField({
  label,
  supporting,
  error = false,
  outlined = false,
  multiline = false,
  className,
  ...rest
}: MdTextFieldProps) {
  const cls = md3Cx(
    "md3-text-field",
    outlined && "md3-text-field--outlined",
    error && "md3-text-field--error",
    className,
  );
  return (
    <label className={cls}>
      {multiline ? (
        <textarea placeholder=" " {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input placeholder=" " {...(rest as InputHTMLAttributes<HTMLInputElement>)} />
      )}
      <span className="md3-text-field__label" aria-hidden="true">
        {label}
      </span>
      <span className="md3-text-field__indicator" aria-hidden="true" />
      {supporting ? <span className="md3-text-field__supporting">{supporting}</span> : null}
    </label>
  );
}

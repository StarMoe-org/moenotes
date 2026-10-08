import type { HTMLAttributes, ReactNode } from "react";
import { md3Cx } from "@/lib/md3/classes";

export function MdSnackbarHost({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={md3Cx("md3-snackbar-host", className)} {...rest}>
      {children}
    </div>
  );
}

export interface MdSnackbarProps extends HTMLAttributes<HTMLDivElement> {
  actionLabel?: ReactNode;
  onAction?: () => void;
  closeLabel?: string;
  onClose?: () => void;
  children?: ReactNode;
}

/** M3 snackbar (single message; queueing stays with the caller). */
export function MdSnackbar({
  actionLabel,
  onAction,
  closeLabel,
  onClose,
  className,
  children,
  ...rest
}: MdSnackbarProps) {
  return (
    <div role="status" className={md3Cx("md3-snackbar", className)} {...rest}>
      <span style={{ flex: "1 1 auto" }}>{children}</span>
      {actionLabel ? (
        <button type="button" className="md3-snackbar__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {onClose ? (
        <button type="button" className="md3-snackbar__close" aria-label={closeLabel} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

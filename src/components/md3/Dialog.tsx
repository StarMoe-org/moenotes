import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { isTopOverlayLayer, pushOverlayLayer, removeOverlayLayer } from "@/lib/overlay/layer-stack";
import { getFocusableElements, trapFocus } from "@/components/shared/Modal";
import { md3Cx } from "@/lib/md3/classes";

export interface MdDialogProps {
  isOpen: boolean;
  onClose: () => void;
  headline?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** Accessible name when no headline is shown. */
  label?: string;
  /** Embedded multi-dialog flows own their URL and can avoid per-dialog history entries. */
  historyNavigation?: boolean;
  className?: string;
}

/**
 * M3 basic dialog. Same overlay behavior as shared/Modal (focus trap, Escape,
 * scroll lock, layer stack, optional history entry, focus restore) with M3
 * motion via CSS (see .md3-dialog; reduced-motion disables the animation).
 */
export function MdDialog({
  isOpen,
  onClose,
  headline,
  icon,
  actions,
  children,
  label,
  historyNavigation = true,
  className,
}: MdDialogProps) {
  const [mounted, setMounted] = useState(false);
  const reactId = useId();
  const dialogKey = `md3-dialog-${reactId}`;
  const headlineId = `${dialogKey}-headline`;
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const stableOnClose = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll(dialogKey);
    pushOverlayLayer(dialogKey);
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    let didPushHistory = false;
    let rafId: number | null = null;
    const isTopDialog = () => isTopOverlayLayer(dialogKey);

    const handlePopState = () => {
      if (isTopDialog()) stableOnClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog() || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        stableOnClose();
        return;
      }
      if (event.key === "Tab") trapFocus(event, panelRef.current);
    };

    const hasModalState = window.history.state?.modal;
    if (historyNavigation && !hasModalState) {
      window.history.pushState({ modal: true }, "");
      didPushHistory = true;
    }
    rafId = requestAnimationFrame(() => {
      window.addEventListener("popstate", handlePopState);
      const panel = panelRef.current;
      if (panel && isTopDialog()) {
        const firstFocusable = getFocusableElements(panel)[0];
        (firstFocusable ?? panel).focus({ preventScroll: true });
      }
    });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      removeOverlayLayer(dialogKey);
      unlockBodyScroll(dialogKey);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("keydown", handleKeyDown);
      if (didPushHistory && window.history.state?.modal) {
        window.history.back();
      }
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget && document.contains(restoreTarget)) {
        requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
      }
    };
  }, [isOpen, dialogKey, stableOnClose, historyNavigation]);

  if (!mounted) return null;
  return createPortal(
    isOpen ? (
      <div className="md3-dialog-backdrop" onClick={stableOnClose}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headline ? headlineId : undefined}
          aria-label={headline ? undefined : label}
          tabIndex={-1}
          className={md3Cx("md3-dialog", className)}
          onClick={(event) => event.stopPropagation()}
        >
          {icon ? (
            <div className="md3-dialog__icon" aria-hidden="true">
              {icon}
            </div>
          ) : null}
          {headline ? (
            <h2 id={headlineId} className="md3-dialog__headline">
              {headline}
            </h2>
          ) : null}
          {children ? <div className="md3-dialog__supporting">{children}</div> : null}
          {actions ? <div className="md3-dialog__actions">{actions}</div> : null}
        </div>
      </div>
    ) : null,
    document.body,
  );
}

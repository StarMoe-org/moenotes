import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { useSpringAnimation } from "@/lib/animation/use-animation";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  closeLabel?: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  headerActions?: ReactNode;
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-5xl",
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const modalStack: string[] = [];

export default function Modal({
  isOpen,
  onClose,
  title,
  closeLabel = "Close",
  size = "md",
  children,
  headerActions,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const reactId = useId();
  const modalKey = `modal-${reactId}`;
  const titleId = `${modalKey}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const { modalTransition, isDisabled } = useSpringAnimation();

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
    lockBodyScroll(modalKey);
    modalStack.push(modalKey);
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    let didPushHistory = false;
    let rafId: number | null = null;

    const isTopModal = () => modalStack[modalStack.length - 1] === modalKey;
    const focusInitialElement = () => {
      const panel = panelRef.current;
      if (!panel || !isTopModal()) return;
      const firstFocusable = getFocusableElements(panel)[0];
      (firstFocusable ?? panel).focus({ preventScroll: true });
    };

    const handlePopState = () => {
      if (isTopModal()) stableOnClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopModal() || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        stableOnClose();
        return;
      }
      if (event.key === "Tab") trapFocus(event, panelRef.current);
    };

    const hasModalState = window.history.state?.modal;
    if (!hasModalState) {
      window.history.pushState({ modal: true }, "");
      didPushHistory = true;
    }
    rafId = requestAnimationFrame(() => {
      window.addEventListener("popstate", handlePopState);
      focusInitialElement();
    });

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      removeFromStack(modalKey);
      unlockBodyScroll(modalKey);
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
  }, [isOpen, modalKey, stableOnClose]);

  if (!mounted) return null;

  const panelInitial = isDisabled ? {} : { opacity: 0, scale: 0.95, y: 10 };
  const panelAnimate = { opacity: 1, scale: 1, y: 0 };
  const panelExit = isDisabled ? {} : { opacity: 0, scale: 0.95, y: 10 };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] isolate flex items-center justify-center p-4 sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={stableOnClose}
          />

          <motion.div
            ref={panelRef}
            className={`relative w-full ${sizeClasses[size]} max-h-[calc(100vh-2rem)] sm:max-h-[85vh] flex flex-col overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]`}
            initial={panelInitial}
            animate={panelAnimate}
            exit={panelExit}
            transition={modalTransition}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : closeLabel}
            tabIndex={-1}
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Tab") trapFocus(event.nativeEvent, panelRef.current);
            }}
          >
            <div className="flex shrink-0 items-center justify-between border-b-[1.5px] border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_8%,transparent)] to-transparent px-5 py-3.5">
              <h2 id={titleId} className="flex items-center gap-2 font-[var(--mn-font-display)] text-base tracking-tight text-[var(--mn-text)]">
                <span className="h-6 w-1.5 rounded-full bg-[var(--mn-accent)]" aria-hidden="true" />
                {title}
              </h2>
              <div className="flex items-center gap-1.5">
                {headerActions}
                <button
                  type="button"
                  onClick={stableOnClose}
                  className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
                  aria-label={closeLabel}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

function trapFocus(event: KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return;
  const focusable = getFocusableElements(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function removeFromStack(key: string): void {
  const index = modalStack.lastIndexOf(key);
  if (index >= 0) modalStack.splice(index, 1);
}

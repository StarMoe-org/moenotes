import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { useSpringAnimation } from "@/lib/animation/use-animation";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
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

export default function Modal({
  isOpen,
  onClose,
  title,
  size = "md",
  children,
  headerActions,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const { modalTransition, isDisabled } = useSpringAnimation();

  // Keep stable onClose ref to avoid re-registering effects
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const stableOnClose = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Body scroll lock + ESC close + history sync
  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll("modal");

    let didPushHistory = false;
    let rafId: number | null = null;

    const handlePopState = () => stableOnClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stableOnClose();
      }
    };

    const hasModalState = window.history.state?.modal;
    if (!hasModalState) {
      window.history.pushState({ modal: true }, "");
      didPushHistory = true;
    }
    rafId = requestAnimationFrame(() => {
      window.addEventListener("popstate", handlePopState);
    });

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unlockBodyScroll("modal");
      window.removeEventListener("popstate", handlePopState);
      if (didPushHistory && window.history.state?.modal) {
        window.history.back();
      }
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, stableOnClose]);

  if (!mounted) return null;

  const panelInitial = isDisabled ? {} : { opacity: 0, scale: 0.95, y: 10 };
  const panelAnimate = { opacity: 1, scale: 1, y: 0 };
  const panelExit = isDisabled ? {} : { opacity: 0, scale: 0.95, y: 10 };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] isolate flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            className={`relative w-full ${sizeClasses[size]} max-h-[calc(100vh-2rem)] sm:max-h-[85vh] flex flex-col overflow-hidden rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]`}
            initial={panelInitial}
            animate={panelAnimate}
            exit={panelExit}
            transition={modalTransition}
          >
            {/* Tape decoration */}
            <div className="pointer-events-none absolute left-1/2 -top-[10px] z-10 h-[18px] w-[70px] -translate-x-1/2 -rotate-[3deg] border-l border-r border-dashed border-black/20" style={{ background: "color-mix(in oklab, var(--mn-yellow) 75%, transparent)" }} />

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b-[2.5px] border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_8%,transparent)] to-transparent px-5 py-3.5">
              <h2 className="flex items-center gap-2 font-[var(--mn-font-display)] text-base tracking-tight text-[var(--mn-text)]">
                <span className="h-6 w-1.5 rounded-full bg-[var(--mn-accent)]" />
                {title}
              </h2>
              <div className="flex items-center gap-1.5">
                {headerActions}
                <button
                  onClick={onClose}
                  className="grid h-8 w-8 place-items-center rounded border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
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

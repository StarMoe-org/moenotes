"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Icon } from "@/components/shared/icons";
import { Md3Provider } from "@/components/md3/Md3Provider";
import { useOverlayLayer } from "@/lib/overlay/use-overlay-layer";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | undefined;
  closeLabel?: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  headerActions?: ReactNode;
  /** Embedded multi-dialog flows own their URL and can avoid per-dialog history entries. */
  historyNavigation?: boolean;
}

const maxWidths = { sm: "xs", md: "sm", lg: "md", xl: "lg" } as const;

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Material 3 dialog (MUI Dialog: extra-large shape, surface-container-high, scrim). Below `sm` it fills the screen
 * (M3 full-screen dialog). Escape, focus trapping, scroll locking and focus restoring come from MUI; on top of that the
 * dialog takes a history entry (Back closes it) and joins the overlay layer stack, so only the top layer reacts.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  closeLabel = "Close",
  size = "md",
  children,
  headerActions,
  historyNavigation = true,
}: ModalProps) {
  return (
    <Md3Provider>
      <ModalDialog isOpen={isOpen} onClose={onClose} title={title} closeLabel={closeLabel} size={size} headerActions={headerActions} historyNavigation={historyNavigation}>
        {children}
      </ModalDialog>
    </Md3Provider>
  );
}

function ModalDialog({ isOpen, onClose, title, closeLabel = "Close", size = "md", children, headerActions, historyNavigation = true }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const reactId = useId();
  const modalKey = `modal-${reactId}`;
  const titleId = `${modalKey}-title`;
  const contentRef = useRef<HTMLDivElement>(null);
  const fullScreen = useMediaQuery("(max-width: 599.95px)");
  const isTop = useOverlayLayer(modalKey, isOpen, onClose, historyNavigation);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Initial focus: the first control of the content (MUI would focus the dialog itself).
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      const content = contentRef.current;
      if (content && isTop()) (getFocusableElements(content)[0] ?? content).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={(_, reason) => {
        // Escape only closes the top layer (a Lightbox over this dialog closes first).
        if (reason === "escapeKeyDown" && !isTop()) return;
        onClose();
      }}
      fullWidth
      maxWidth={maxWidths[size]}
      fullScreen={fullScreen}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : closeLabel}
      className="mn-modal"
      slotProps={{ paper: { className: "mn-overlay-panel" } }}
    >
      <div className="flex shrink-0 items-center gap-2 py-3 pl-6 pr-3">
        <h2 id={titleId} className="min-w-0 flex-1 truncate font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">
          {title}
        </h2>
        {headerActions}
        <IconButton onClick={onClose} aria-label={closeLabel}>
          <Icon name="close" />
        </IconButton>
      </div>
      <div ref={contentRef} tabIndex={-1} className="mn-overlay-body min-h-0 flex-1 overflow-y-auto px-6 pb-6 outline-none">
        {children}
      </div>
    </Dialog>
  );
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

export function trapFocus(event: KeyboardEvent, panel: HTMLElement | null): void {
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

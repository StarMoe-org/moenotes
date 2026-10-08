import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import { isTopOverlayLayer } from "@/lib/overlay/layer-stack";
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
  const [mounted, setMounted] = useState(false);
  const reactId = useId();
  const modalKey = `modal-${reactId}`;
  const titleId = `${modalKey}-title`;
  const contentRef = useRef<HTMLDivElement>(null);
  useOverlayLayer(modalKey, isOpen);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const stableOnClose = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // History entry (Back closes) and initial focus; scroll lock, focus trap and
  // focus restore come from the MUI dialog itself.
  useEffect(() => {
    if (!isOpen) return;

    const isTopModal = () => isTopOverlayLayer(modalKey);
    const focusInitialElement = () => {
      const content = contentRef.current;
      if (!content || !isTopModal()) return;
      const firstFocusable = getFocusableElements(content)[0];
      (firstFocusable ?? content).focus({ preventScroll: true });
    };

    let didPushHistory = false;
    const handlePopState = () => {
      if (isTopModal()) stableOnClose();
    };

    const hasModalState = window.history.state?.modal;
    if (historyNavigation && !hasModalState) {
      window.history.pushState({ modal: true }, "");
      didPushHistory = true;
    }
    const rafId = requestAnimationFrame(() => {
      window.addEventListener("popstate", handlePopState);
      focusInitialElement();
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("popstate", handlePopState);
      if (didPushHistory && window.history.state?.modal) {
        window.history.back();
      }
    };
  }, [isOpen, modalKey, stableOnClose, historyNavigation]);

  if (!mounted) return null;

  const handleClose = (_event: object, reason: string) => {
    if (reason === "escapeKeyDown" && !isTopOverlayLayer(modalKey)) return;
    stableOnClose();
  };

  return (
    <MdMuiProvider>
      <Dialog
        open={isOpen}
        onClose={handleClose}
        fullWidth
        maxWidth={maxWidths[size]}
        scroll="paper"
        disableAutoFocus
        aria-labelledby={titleId}
        slotProps={{ paper: { sx: { borderRadius: 7 } } }}
      >
        <div ref={contentRef} tabIndex={-1} style={{ display: "contents" }}>
          <DialogTitle id={titleId} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {title ? title : (
              <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
                {closeLabel}
              </Box>
            )}
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
              {headerActions}
              <IconButton size="small" onClick={stableOnClose} aria-label={closeLabel}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent>{children}</DialogContent>
        </div>
      </Dialog>
    </MdMuiProvider>
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

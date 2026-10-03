import type { ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Modal, { type ModalProps } from "@/components/shared/Modal";

export interface DetailOverlayProps {
  locale: AppLocale;
  open: boolean;
  onClose: () => void;
  title?: string | undefined;
  /** Close button name (default `modal.close`). */
  closeLabel?: string | undefined;
  size?: ModalProps["size"] | undefined;
  headerActions?: ReactNode | undefined;
  children?: ReactNode;
}

/**
 * Shell of an entry's detail opened over its list (`?item=<id>`, see useQueryOverlay): title, close button and a
 * content slot, on the shared Modal (focus trap, scroll lock, Escape, and a history entry Back closes).
 */
export default function DetailOverlay({ locale, open, onClose, title, closeLabel, size, headerActions, children }: DetailOverlayProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title={title} closeLabel={closeLabel ?? t(locale, "modal.close")} size={size ?? "lg"} headerActions={headerActions}>
      {open ? children : null}
    </Modal>
  );
}

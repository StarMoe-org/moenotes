"use client";

import Modal from "@/components/shared/Modal";
import type { AppLocale } from "@/config/locales";
import { shortcuts } from "@/config/shortcuts";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";

/** The keyboard shortcuts (?), as an M3 list in a dialog. */
export default function KeyboardShortcutsHelp({ locale }: { locale: AppLocale }) {
  const { isOpen, close } = useOverlay("shortcuts");
  return (
    <Modal isOpen={isOpen} onClose={close} title={t(locale, "shell.shortcuts")} closeLabel={t(locale, "actions.close")} size="md" historyNavigation={false}>
      <ul className="divide-y divide-outline-variant">
        {shortcuts.map((shortcut) => (
          <li key={shortcut.id} className="flex min-h-14 items-center justify-between gap-4 py-2">
            <span className="text-body-large text-on-surface">{t(locale, shortcut.labelKey)}</span>
            <kbd className="shrink-0 rounded-shape-sm bg-surface-container-highest px-2.5 py-1 font-sans text-label-large text-on-surface-variant">{shortcut.combos[0]}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

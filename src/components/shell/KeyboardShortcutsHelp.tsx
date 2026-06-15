import Modal from "@/components/shared/Modal";
import type { AppLocale } from "@/config/locales";
import { shortcuts } from "@/config/shortcuts";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";

export default function KeyboardShortcutsHelp({ locale }: { locale: AppLocale }) {
  const { isOpen, close } = useOverlay("shortcuts");
  return (
    <Modal isOpen={isOpen} onClose={close} title={t(locale, "shell.shortcuts")} closeLabel={t(locale, "actions.close")} size="md">
      <div className="space-y-2">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.id} className="flex items-center justify-between rounded-2xl border-2 border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-4 py-3 text-sm font-bold shadow-[var(--mn-shadow-stamp-sm)]">
            <span>{t(locale, shortcut.labelKey)}</span>
            <kbd className="rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-yellow)] px-2.5 py-1 text-xs font-black text-[var(--mn-text)]">{shortcut.combos[0]}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}

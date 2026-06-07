import type { AppLocale } from "@/config/locales";
import { shortcuts } from "@/config/shortcuts";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";

export default function KeyboardShortcutsHelp({ locale }: { locale: AppLocale }) {
  const { isOpen, close } = useOverlay("shortcuts");
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4 backdrop-blur-[2px]" onClick={close}>
      <div className="w-full max-w-lg rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-stamp-lg)]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between border-b-2 border-[var(--mn-border)] pb-4">
          <h2 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)]">{t(locale, "shell.shortcuts")}</h2>
          <button onClick={close} className="rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-4 py-1 text-sm font-black text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] hover:bg-[var(--mn-cream-deep)]">{t(locale, "actions.close")}</button>
        </div>
        <div className="space-y-2">
          {shortcuts.map((shortcut) => <div key={shortcut.id} className="flex items-center justify-between rounded-2xl border-2 border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-4 py-3 text-sm font-bold shadow-[var(--mn-shadow-stamp-sm)]"><span>{t(locale, shortcut.labelKey)}</span><kbd className="rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-yellow)] px-2.5 py-1 text-xs font-black text-[var(--mn-text)]">{shortcut.combos[0]}</kbd></div>)}
        </div>
      </div>
    </div>
  );
}

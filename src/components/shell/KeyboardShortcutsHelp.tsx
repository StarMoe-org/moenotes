import type { AppLocale } from "@/config/locales";
import { shortcuts } from "@/config/shortcuts";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";

export default function KeyboardShortcutsHelp({ locale }: { locale: AppLocale }) {
  const { isOpen, close } = useOverlay("shortcuts");
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-sm" onClick={close}>
      <div className="mn-glass w-full max-w-lg rounded-[2rem] p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t(locale, "shell.shortcuts")}</h2>
          <button onClick={close} className="rounded-full px-3 py-1 text-sm text-[var(--mn-text-muted)] hover:bg-white/30">{t(locale, "actions.close")}</button>
        </div>
        <div className="space-y-2">
          {shortcuts.map((shortcut) => <div key={shortcut.id} className="flex items-center justify-between rounded-2xl border border-[var(--mn-border)] px-4 py-3 text-sm"><span>{t(locale, shortcut.labelKey)}</span><kbd className="rounded-lg bg-black/10 px-2 py-1 text-xs">{shortcut.combos[0]}</kbd></div>)}
        </div>
      </div>
    </div>
  );
}

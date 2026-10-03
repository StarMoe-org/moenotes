import { useEffect, useState } from "react";
import type { AppLocale } from "@/config/locales";
import Modal from "@/components/shared/Modal";
import { t } from "@/i18n";
import {
  HOME_LAYOUT_CHANGED_EVENT,
  applyHomeLayout,
  defaultHomeLayout,
  isDefaultHomeLayout,
  moveHomeModule,
  readHomeLayout,
  saveHomeLayout,
  toggleHomeModule,
  type HomeLayout,
  type HomeModuleId,
} from "@/lib/home/layout";

interface Props {
  locale: AppLocale;
}

/** The "Customize" button of the home page and its dialog: reorder and hide the home modules. */
export default function HomeLayoutEditor({ locale }: Props) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<HomeLayout>(defaultHomeLayout);

  useEffect(() => {
    const stored = readHomeLayout();
    setLayout(stored);
    // The head script applied it before the first paint; this keeps the style element in sync after hydration.
    applyHomeLayout(stored);
    const sync = (event: Event) => setLayout((event as CustomEvent<HomeLayout>).detail);
    window.addEventListener(HOME_LAYOUT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(HOME_LAYOUT_CHANGED_EVENT, sync);
  }, []);

  const update = (next: HomeLayout) => {
    setLayout(next);
    saveHomeLayout(next);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mn-focus inline-flex items-center gap-1.5 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] px-3 py-1.5 text-xs font-bold text-[var(--mn-ink-soft)] hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)] hover:text-[var(--mn-accent-deep)]"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
        {t(locale, "home.layout.customize")}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={t(locale, "home.layout.title")} closeLabel={t(locale, "actions.close")} size="sm">
        <p className="mb-4 text-xs leading-5 text-[var(--mn-text-muted)]">{t(locale, "home.layout.description")}</p>
        <ol className="space-y-2">
          {layout.order.map((id, index) => (
            <ModuleRow
              key={id}
              locale={locale}
              id={id}
              hidden={layout.hidden.includes(id)}
              first={index === 0}
              last={index === layout.order.length - 1}
              onMove={(step) => update(moveHomeModule(layout, id, step))}
              onToggle={() => update(toggleHomeModule(layout, id))}
            />
          ))}
        </ol>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={isDefaultHomeLayout(layout)}
            onClick={() => update(defaultHomeLayout())}
            className="mn-focus rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-2 text-sm font-bold text-[var(--mn-text)] hover:bg-[var(--mn-cream-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t(locale, "home.layout.reset")}
          </button>
        </div>
      </Modal>
    </>
  );
}

function ModuleRow({ locale, id, hidden, first, last, onMove, onToggle }: {
  locale: AppLocale;
  id: HomeModuleId;
  hidden: boolean;
  first: boolean;
  last: boolean;
  onMove: (step: -1 | 1) => void;
  onToggle: () => void;
}) {
  const name = t(locale, `home.layout.modules.${id}`);
  const arrow = "mn-focus grid h-8 w-8 place-items-center rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] text-[var(--mn-ink-soft)] hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)] disabled:opacity-30";
  return (
    <li className={`flex items-center gap-2 rounded-2xl border border-[var(--mn-glass-border)] px-3 py-2 ${hidden ? "bg-[var(--mn-cream-deep)]" : "bg-[var(--mn-surface-strong)]"}`}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={!hidden} onChange={onToggle} className="h-4 w-4 shrink-0 accent-[var(--mn-accent-deep)]" />
        <span className={`truncate text-sm font-bold ${hidden ? "text-[var(--mn-text-muted)] line-through" : "text-[var(--mn-text)]"}`}>{name}</span>
      </label>
      <button type="button" className={arrow} disabled={first} onClick={() => onMove(-1)} aria-label={t(locale, "home.layout.moveUp", { name })} title={t(locale, "home.layout.moveUp", { name })}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
      </button>
      <button type="button" className={arrow} disabled={last} onClick={() => onMove(1)} aria-label={t(locale, "home.layout.moveDown", { name })} title={t(locale, "home.layout.moveDown", { name })}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </li>
  );
}

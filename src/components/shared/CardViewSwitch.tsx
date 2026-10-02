import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { CardView } from "@/lib/cards/use-card-view";

const VIEWS: readonly CardView[] = ["card", "square"];

/** Card list display switch, in the server switch's segmented style. */
export default function CardViewSwitch({ locale, value, onChange }: { locale: AppLocale; value: CardView; onChange: (view: CardView) => void }) {
  return (
    <div className="mn-segmented flex w-fit gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={t(locale, "cards.view.label")}>
      {VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => onChange(view)}
          aria-pressed={view === value}
          className={`mn-focus flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${view === value ? "bg-[var(--mn-accent-soft)] text-[var(--mn-text)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"}`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            {view === "card"
              ? <><rect x="1" y="1" width="6" height="8" rx="1" /><rect x="9" y="1" width="6" height="8" rx="1" /><rect x="1" y="11" width="6" height="4" rx="1" /><rect x="9" y="11" width="6" height="4" rx="1" /></>
              : <><rect x="1" y="1" width="4" height="4" rx=".8" /><rect x="6" y="1" width="4" height="4" rx=".8" /><rect x="11" y="1" width="4" height="4" rx=".8" /><rect x="1" y="6" width="4" height="4" rx=".8" /><rect x="6" y="6" width="4" height="4" rx=".8" /><rect x="11" y="6" width="4" height="4" rx=".8" /><rect x="1" y="11" width="4" height="4" rx=".8" /><rect x="6" y="11" width="4" height="4" rx=".8" /><rect x="11" y="11" width="4" height="4" rx=".8" /></>}
          </svg>
          {t(locale, `cards.view.${view}`)}
        </button>
      ))}
    </div>
  );
}

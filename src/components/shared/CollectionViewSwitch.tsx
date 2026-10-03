import type { ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { CollectionView } from "@/lib/collection/use-collection-view";

export { useCollectionView, collectionViews, type CollectionView, type CollectionViewOptions } from "@/lib/collection/use-collection-view";

const ICONS: Record<CollectionView, ReactNode> = {
  card: <><rect x="1" y="1" width="6" height="8" rx="1" /><rect x="9" y="1" width="6" height="8" rx="1" /><rect x="1" y="11" width="6" height="4" rx="1" /><rect x="9" y="11" width="6" height="4" rx="1" /></>,
  square: <><rect x="1" y="1" width="4" height="4" rx=".8" /><rect x="6" y="1" width="4" height="4" rx=".8" /><rect x="11" y="1" width="4" height="4" rx=".8" /><rect x="1" y="6" width="4" height="4" rx=".8" /><rect x="6" y="6" width="4" height="4" rx=".8" /><rect x="11" y="6" width="4" height="4" rx=".8" /><rect x="1" y="11" width="4" height="4" rx=".8" /><rect x="6" y="11" width="4" height="4" rx=".8" /><rect x="11" y="11" width="4" height="4" rx=".8" /></>,
  grid: <><rect x="1" y="1" width="6" height="6" rx="1.2" /><rect x="9" y="1" width="6" height="6" rx="1.2" /><rect x="1" y="9" width="6" height="6" rx="1.2" /><rect x="9" y="9" width="6" height="6" rx="1.2" /></>,
  list: <><rect x="1" y="2" width="3" height="3" rx=".8" /><rect x="5.5" y="2.5" width="9.5" height="2" rx="1" /><rect x="1" y="6.5" width="3" height="3" rx=".8" /><rect x="5.5" y="7" width="9.5" height="2" rx="1" /><rect x="1" y="11" width="3" height="3" rx=".8" /><rect x="5.5" y="11.5" width="9.5" height="2" rx="1" /></>,
  table: <><rect x="1" y="1.5" width="14" height="3" rx=".8" /><rect x="1" y="6" width="4" height="2.5" rx=".6" /><rect x="6" y="6" width="9" height="2.5" rx=".6" /><rect x="1" y="10" width="4" height="2.5" rx=".6" /><rect x="6" y="10" width="9" height="2.5" rx=".6" /></>,
};

export interface CollectionViewSwitchProps<V extends CollectionView> {
  locale: AppLocale;
  /** Views offered, in order. */
  views: readonly V[];
  value: V;
  onChange: (view: V) => void;
  /** Accessible group name (default `collectionView.label`). */
  label?: string;
  /** Button text per view (default `collectionView.<view>`). */
  labels?: Partial<Record<V, string>>;
  /** Hide the text on narrow screens, leaving the icon (the text stays the button's name). */
  compact?: boolean;
}

/** Segmented view switch in the server switch's style; pair with {@link useCollectionView}. */
export default function CollectionViewSwitch<V extends CollectionView>({ locale, views, value, onChange, label, labels, compact = false }: CollectionViewSwitchProps<V>) {
  return (
    <div className="mn-segmented flex w-fit gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={label ?? t(locale, "collectionView.label")}>
      {views.map((view) => {
        const text = labels?.[view] ?? t(locale, `collectionView.${view}`);
        return (
          <button
            key={view}
            type="button"
            onClick={() => onChange(view)}
            aria-pressed={view === value}
            aria-label={compact ? text : undefined}
            title={compact ? text : undefined}
            className={`mn-focus flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${view === value ? "bg-[var(--mn-accent-soft)] text-[var(--mn-text)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"}`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{ICONS[view]}</svg>
            {compact ? <span className="hidden sm:inline">{text}</span> : text}
          </button>
        );
      })}
    </div>
  );
}

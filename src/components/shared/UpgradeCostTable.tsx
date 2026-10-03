import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";

export interface UpgradeCost {
  name: string;
  /** Already resolved for the current server (e.g. through useAssetUrl). */
  imageUrl: string;
  count: number;
  /** Locale-free internal path (entityLinkPath) of the material's page; the chip becomes a link. */
  href?: string;
  /** Stable key across steps for the cumulative totals (default: `name`). */
  id?: string | number;
}

export interface UpgradeStep {
  from: string | number;
  to: string | number;
  costs: readonly UpgradeCost[];
}

export interface UpgradeCostTableProps {
  locale: AppLocale;
  steps: readonly UpgradeStep[];
  /** Header of the step column (default `designSystem.upgrade.step`). */
  stepHeader?: string;
  /** Header of the cost column (default `designSystem.upgrade.cost`). */
  costHeader?: string;
  /** Row label of a step (default "from → to"). */
  formatStep?: (step: UpgradeStep) => string;
  /** Shown when there are no steps (default `designSystem.upgrade.empty`). */
  emptyText?: string;
  /** Offer the "running total" toggle (default false). */
  cumulative?: boolean;
  /** Initial state of the running total toggle. */
  defaultCumulative?: boolean;
}

/** Steps with every cost summed over all steps up to and including each one (materials keep first-seen order). */
export function cumulativeUpgradeSteps(steps: readonly UpgradeStep[]): UpgradeStep[] {
  const totals = new Map<string | number, UpgradeCost>();
  return steps.map((step) => {
    for (const cost of step.costs) {
      const key = cost.id ?? cost.name;
      const previous = totals.get(key);
      totals.set(key, previous ? { ...previous, count: previous.count + cost.count } : { ...cost });
    }
    return { ...step, costs: [...totals.values()].map((cost) => ({ ...cost })) };
  });
}

/** Per-step material costs: one row per step, every material that step costs, with an optional running total. */
export default function UpgradeCostTable({
  locale,
  steps,
  stepHeader,
  costHeader,
  formatStep = (step) => `${step.from} → ${step.to}`,
  emptyText,
  cumulative = false,
  defaultCumulative = false,
}: UpgradeCostTableProps) {
  const [showTotal, setShowTotal] = useState(defaultCumulative);
  const visible = useMemo(() => steps.filter((step) => step.costs.length > 0), [steps]);
  const rows = useMemo(() => (cumulative && showTotal ? cumulativeUpgradeSteps(visible) : visible), [cumulative, showTotal, visible]);
  if (visible.length === 0) {
    return <p className="text-sm font-medium text-[var(--mn-text-muted)]">{emptyText ?? t(locale, "designSystem.upgrade.empty")}</p>;
  }
  const toggle = cumulative ? (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            aria-pressed={showTotal}
            onClick={() => setShowTotal((value) => !value)}
            className={`mn-focus rounded-full border border-[var(--mn-border)] px-3 py-1 text-xs font-bold transition ${showTotal ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "bg-[var(--mn-paper)] text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
          >
            {t(locale, "designSystem.upgrade.cumulative")}
          </button>
        </div>
      ) : null;
  const table = (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-bold uppercase tracking-wide text-[var(--mn-text-muted)]/80">
            <th scope="col" className="py-2 pr-3">{stepHeader ?? t(locale, "designSystem.upgrade.step")}</th>
            <th scope="col" className="py-2">{costHeader ?? t(locale, "designSystem.upgrade.cost")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--mn-border)]/40">
          {rows.map((step) => (
            <tr key={`${step.from}-${step.to}`}>
              <th scope="row" className="py-2 pr-3 align-top whitespace-nowrap font-bold text-[var(--mn-text)]">
                {formatStep(step)}
              </th>
              <td className="py-2">
                <ul className="flex flex-wrap gap-2">
                  {step.costs.map((cost) => {
                    const body = (
                      <>
                        {cost.imageUrl ? <img src={cost.imageUrl} alt="" loading="lazy" className="h-6 w-6 object-contain" /> : null}
                        <span className="font-medium text-[var(--mn-text)]">{cost.name}</span>
                        <span className="font-black tabular-nums text-[var(--mn-text)]">×{cost.count.toLocaleString(locale)}</span>
                      </>
                    );
                    const chip = "flex items-center gap-1.5 rounded-lg border border-[var(--mn-border)]/60 bg-[var(--mn-cream-deep)]/40 px-2 py-1";
                    return (
                      <li key={cost.id ?? cost.name} className={cost.href ? undefined : chip} title={cost.name}>
                        {cost.href ? (
                          <a href={localizePath(cost.href, locale)} className={`mn-focus ${chip} transition hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)]`}>{body}</a>
                        ) : body}
                      </li>
                    );
                  })}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
  );
  // Without the toggle the table is the root element, as the band item overlay always had it.
  return toggle ? <div>{toggle}{table}</div> : table;
}

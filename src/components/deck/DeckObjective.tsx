import { useId } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { computes, readsAccuracy, type DeckAggregation, type DeckGoalInput, type DeckSolverCapabilities } from "@/lib/deck/goals";

/** Choose how to rank random outcomes without changing the live or its play conditions. */
export default function DeckObjective({ locale, input, capabilities, onChange }: {
  locale: AppLocale;
  input: DeckGoalInput;
  capabilities: DeckSolverCapabilities | null;
  onChange: (aggregation: DeckAggregation) => void;
}) {
  const id = useId();
  if (!readsAccuracy(input)) return null;
  const tr = (key: string) => t(locale, `deckWorkspace.objective.${key}`);
  const maximum = !!capabilities && computes(capabilities, { ...input, aggregation: "maximum" });
  return <fieldset className="dc-objective" aria-describedby={`${id}-note${maximum ? "" : ` ${id}-availability`}`}>
    <legend>{tr("label")}</legend>
    <div className="dc-objective-options">
      {(["expected", "maximum"] as const).map(aggregation => <label key={aggregation}>
        <input type="radio" name={id} value={aggregation} checked={input.aggregation === aggregation}
          disabled={aggregation === "maximum" && !maximum} onChange={() => onChange(aggregation)} />
        <span>{tr(aggregation)}</span>
      </label>)}
    </div>
    <p id={`${id}-note`} className="dw-muted">{tr(`${input.aggregation}Note`)}</p>
    {!maximum && <p id={`${id}-availability`} className="dw-muted">{tr(capabilities ? "unavailable" : "loading")}</p>}
  </fieldset>;
}

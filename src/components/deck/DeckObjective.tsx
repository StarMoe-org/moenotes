"use client";

import { useId } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { computes, effectiveAggregation, readsAccuracy, type DeckAggregation, type DeckGoalInput, type DeckSolverCapabilities } from "@/lib/deck/goals";
import { DeckSegmented } from "./DeckControls";

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
  const selected = effectiveAggregation(input);
  const maximum = !!capabilities && computes(capabilities, { ...input, aggregation: "maximum" });
  // Tagged only once the loaded engine has answered; while it loads, the availability note says so instead.
  const unsupported = !!capabilities && !maximum;
  return (
    <div className="dc-objective" aria-describedby={`${id}-note${maximum ? "" : ` ${id}-availability`}`}>
      <DeckSegmented
        label={tr("label")}
        value={selected}
        onChange={onChange}
        options={(["expected", "maximum"] as const).map((aggregation) => ({
          value: aggregation,
          label: tr(aggregation),
          note: aggregation === "maximum" && unsupported ? tr("unsupported") : undefined,
          disabled: aggregation === "maximum" && !maximum,
        }))}
      />
      <p id={`${id}-note`} className="dc-field-hint">{tr(`${selected}Note`)}</p>
      {!maximum && <p id={`${id}-availability`} className="dc-field-hint">{tr(capabilities ? "unavailable" : "loading")}</p>}
    </div>
  );
}

import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { computes, computesGoal, type DeckGoalInput, type DeckSolverCapabilities } from "@/lib/deck/goals";

/** What the theoretical maximum takes the best of, why Gekisou modes are not offered, and whether the loaded engine computes the chosen venue. */
export default function DeckPeakNote({ locale, input, capabilities }: {
  locale: AppLocale;
  input: DeckGoalInput;
  capabilities: DeckSolverCapabilities | null;
}) {
  if (input.goal !== "peak") return null;
  const tr = (key: string) => t(locale, `deckWorkspace.peak.${key}`);
  // A venue the engine does not compute yet, while another venue of the goal works.
  const venueUnavailable = !!capabilities && computesGoal(capabilities, "peak") && !computes(capabilities, { goal: "peak", venue: input.venue });
  return <>
    <p className="dw-muted">{tr("ordinaryNote")}</p>
    <p className="dw-muted">{tr("noGekisou")}</p>
    {venueUnavailable && <p className="dw-muted">{tr("venueUnavailable")}</p>}
  </>;
}

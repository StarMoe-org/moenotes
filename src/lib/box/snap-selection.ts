import type { SnapSkillChoice } from "@/lib/chart-data/snap-types";
import type { CardBox } from "./model";

/** A collection filter changes offered choices only. Ownership and replay assumptions stay separate. */
export function ownedSnapChoices(choices: readonly SnapSkillChoice[], box: CardBox): SnapSkillChoice[] {
  const ranks = new Map(box.cards.filter(card => card.kind === "snap" && card.identity.value !== null && card.fields.rank.value !== null)
    .map(card => [card.identity.value!, card.fields.rank.value!]));
  return choices.flatMap(choice => {
    const rankBindings = choice.rankBindings.filter(binding => ranks.get(String(binding.cardId)) === binding.rank);
    return rankBindings.length ? [{ ...choice, rankBindings, cardIds: [...new Set(rankBindings.map(binding => binding.cardId))] }] : [];
  });
}

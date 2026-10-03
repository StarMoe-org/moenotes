import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import type { BoxCard, CardBox } from "./model";

export interface DeckPreviewCatalogue {
  members: readonly Pick<CardViewModel, "id" | "characterId">[];
  snaps: readonly Pick<SupportCardViewModel, "id">[];
}
export interface DeckPreview {
  source: "baseline" | "collection";
  members: (BoxCard | null)[];
  snaps: (BoxCard | null)[];
}

/** Display an owned team. This reads facts and never evaluates scores or writes cultivation. */
export function createDeckPreview(box: CardBox | null, catalogue: DeckPreviewCatalogue, constraints: {
  required: readonly string[]; excluded: readonly string[];
} = { required: [], excluded: [] }): DeckPreview {
  const members = new Map(catalogue.members.map(card => [String(card.id), card]));
  const snaps = new Set(catalogue.snaps.map(card => String(card.id)));
  const held = (kind: BoxCard["kind"], id: string | null) => box?.cards.find(card => card.kind === kind
    && card.identity.value === id && id !== null && !card.identity.needsReview && card.identity.status !== "conflict") ?? null;
  const baseline = box?.baseline;
  if (baseline?.members.length === 5 && baseline.snaps.length === 5) {
    const selected = baseline.members.map(id => held("member", id));
    const characters = baseline.members.map(id => members.get(id)?.characterId);
    const selectedSnaps = baseline.snaps.map(id => held("snap", id));
    if (selected.every(Boolean) && characters.every(id => id !== undefined) && new Set(characters).size === 5
      && baseline.snaps.every((id, index) => id === null || snaps.has(id) && selectedSnaps[index] !== null)
      && new Set(baseline.snaps.filter(id => id !== null)).size === baseline.snaps.filter(id => id !== null).length) {
      // A comparison team remains independent from the cards excluded from a future search.
      return { source: "baseline", members: selected, snaps: selectedSnaps };
    }
  }
  const available = (box?.cards ?? []).filter(card => card.identity.value !== null && !card.identity.needsReview
    && card.identity.status !== "conflict" && !constraints.excluded.includes(card.key));
  const ordered = [...available.filter(card => constraints.required.includes(card.key)), ...available.filter(card => !constraints.required.includes(card.key))];
  const pickedMembers: BoxCard[] = [], pickedSnaps: BoxCard[] = [];
  const characters = new Set<number>(), snapIds = new Set<string>();
  for (const card of ordered) {
    if (card.kind === "member") {
      const character = members.get(card.identity.value!)?.characterId;
      if (character === undefined || characters.has(character) || pickedMembers.length === 5) continue;
      characters.add(character); pickedMembers.push(card);
    } else if (snaps.has(card.identity.value!) && !snapIds.has(card.identity.value!) && pickedSnaps.length < 5) {
      snapIds.add(card.identity.value!); pickedSnaps.push(card);
    }
  }
  return { source: "collection", members: Array.from({ length: 5 }, (_, index) => pickedMembers[index] ?? null),
    snaps: Array.from({ length: 5 }, (_, index) => pickedSnaps[index] ?? null) };
}

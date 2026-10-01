import type { CardViewModel } from "../cards/data";
import type { SnapMemberSelection } from "./snap-query";

export interface SearchableSnapMember { id: number; name: string; vm?: CardViewModel; gkLevels: number[] }
const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** AND search over this replay snapshot's labels; missing artwork never becomes a guessed asset ID. */
export function searchSnapMembers<T extends SearchableSnapMember>(members: readonly T[], query: string, bandId: number | null = null, cardType: number | null = null): T[] {
  const terms = normalized(query).split(" ").filter(Boolean);
  return members.filter((member) => {
    const vm = member.vm;
    if (bandId !== null && vm?.bandId !== bandId) return false;
    if (cardType !== null && vm?.cardType !== cardType) return false;
    const text = normalized([member.id, member.name, vm?.title, vm?.characterName, vm?.bandName,
      vm?.characterId, vm?.bandId, vm?.searchText].filter((value) => value !== undefined).join(" "));
    return terms.every((term) => text.includes(term));
  });
}

/** Changing the physical slot's member clears the previous member's Gekisou level. */
export function draftSnapMember(previous: SnapMemberSelection | null, memberId: number): SnapMemberSelection {
  return { memberId, gekisouLevel: previous?.memberId === memberId ? previous.gekisouLevel : null };
}

export function isValidSnapMemberDraft(value: SnapMemberSelection | null, members: readonly SearchableSnapMember[]): boolean {
  if (!value) return true;
  const member = members.find((entry) => entry.id === value.memberId);
  return Boolean(member && (value.gekisouLevel === null || member.gkLevels.includes(value.gekisouLevel)));
}

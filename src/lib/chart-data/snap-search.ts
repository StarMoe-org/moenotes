import type { SnapSkillChoice, SnapSkillKind } from "./snap-types";

const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** Search names, source Snap names, descriptions and IDs; every token must match. */
export function searchSnapSkills(
  choices: readonly SnapSkillChoice[],
  query: string,
  kind: SnapSkillKind | "all" = "all",
  availableOnly = false,
): SnapSkillChoice[] {
  const terms = normalized(query).split(" ").filter(Boolean);
  return choices.filter((choice) => {
    if (kind !== "all" && choice.kind !== kind) return false;
    if (availableOnly && choice.status === "unsupported") return false;
    const text = normalized([choice.name, choice.description, ...choice.searchTerms, String(choice.skillId),
      ...choice.cardIds.map(String), ...choice.effectTypes.map(String)].join(" "));
    return terms.every((term) => text.includes(term));
  });
}

/** One visible tile per skill; levels remain explicit in the picker rather than repeating identical tiles. */
export function groupSnapSkills(choices: readonly SnapSkillChoice[]): SnapSkillChoice[][] {
  const groups = new Map<string, SnapSkillChoice[]>();
  for (const choice of choices) {
    const key = `${choice.kind}:${choice.skillId}`;
    const group = groups.get(key) ?? [];
    if (!group.some((entry) => entry.level === choice.level)) group.push(choice);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => group.sort((a, b) => a.level - b.level))
    .sort((a, b) => Number(a[0]!.kind === "gekisou-support") - Number(b[0]!.kind === "gekisou-support") || a[0]!.skillId - b[0]!.skillId);
}

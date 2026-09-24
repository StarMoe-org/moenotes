import type { GachaDrawEntry, GachaDrawPlan } from "@/lib/gacha/data";

function pick(entries: readonly GachaDrawEntry[], random: () => number): GachaDrawEntry | undefined {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

/** Simulates one purchase: weighted draws, with the plan's guaranteed slots drawn from the eligible cards only. */
export function drawGacha(entries: readonly GachaDrawEntry[], plan: GachaDrawPlan, random: () => number = Math.random): GachaDrawEntry[] {
  const guaranteedPool = plan.guaranteeRarity > 0 ? entries.filter((entry) => entry.kind !== "item" && entry.rarity >= plan.guaranteeRarity) : [];
  const results: GachaDrawEntry[] = [];
  for (let index = 0; index < plan.count; index += 1) {
    const guaranteed = guaranteedPool.length > 0 && index >= plan.count - plan.guaranteeCount;
    const entry = pick(guaranteed ? guaranteedPool : entries, random);
    if (entry) results.push(entry);
  }
  return results;
}

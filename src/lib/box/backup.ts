import { sha256Hex } from "@/lib/account/game-saves";
import { parseBox, type BoxField, type CardBox, type Observation } from "./model";

export const BOX_BACKUP_MAX_BYTES = 20_000_000;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** A portable snapshot contains all displayed facts, detached from the original save. */
export async function exportBoxBackup(displayed: CardBox): Promise<string> {
  const clean = parseBox(JSON.stringify(displayed));
  clean.save = null;
  const fields: BoxField<unknown>[] = [
    ...clean.cards.flatMap(card => [card.identity, ...Object.values(card.fields)]),
    ...Object.values(clean.player.characterRanks), ...Object.values(clean.player.bandItems),
    ...Object.values(clean.player.bandItemStates), ...Object.values(clean.player.catalogFields),
    clean.player.characterTotalRank, clean.player.vipRank, clean.player.memory, clean.player.eventIds,
  ];
  await Promise.all(fields.map(async field => {
    for (const item of field.history) {
      if (item.source !== "game-save") continue;
      // Derivation IDs name a save and field, but values can change with Master/catalogue data.
      // Hash all evidence, retaining the original source ID; re-exporting a snapshot is stable.
      const id = item.id.replace(/:snapshot:[a-f0-9]{64}$/, "");
      const digest = await sha256Hex(new TextEncoder().encode(canonical({ ...item, id })));
      item.id = `${id}:snapshot:${digest}`;
    }
    // Imported histories may carry alternate snapshot suffixes for the same evidence.
    // Normalization deduplicates identical facts without merging conflicting identities.
    const evidence = new Map<string, Observation<unknown>>();
    for (const item of field.history) {
      const previous = evidence.get(item.id);
      if (previous && canonical(previous) !== canonical(item)) throw new Error("Observation identity collision");
      evidence.set(item.id, item);
    }
    field.history = [...evidence.values()];
  }));
  const text = JSON.stringify(clean, null, 2);
  if (new TextEncoder().encode(text).byteLength > BOX_BACKUP_MAX_BYTES) throw new Error("Backup is too large");
  parseBox(text);
  return text;
}

/** Snapshots and legacy pointer-only Boxes share the original strict Box format. */
export function parseBoxBackup(text: string): CardBox {
  if (new TextEncoder().encode(text).byteLength > BOX_BACKUP_MAX_BYTES) throw new Error("Backup is too large");
  return parseBox(text);
}

import { mergeBoxBackup, type CardBox } from "./model";
import type { BoxMode, CardBoxSession } from "./session";

export interface BackupSourcePreference {
  get: () => boolean;
  set: (ownFacts: boolean) => void;
}

/** Both import entry points opt out before writes, so an automatic save cannot hide restored facts. */
export async function restoreBoxBackup(session: CardBoxSession, incoming: CardBox, mode: BoxMode,
  preference: BackupSourcePreference, expectedBoxId?: string): Promise<boolean> {
  if (incoming.server !== session.server) throw new Error("Backup belongs to another server");
  const initial = session.getSnapshot();
  if (expectedBoxId !== undefined && initial.box?.id !== expectedBoxId) throw new Error("Card box changed during import");
  if (initial.busy) return false;
  // Linked collections require the existing explicit unlink action before importing independent facts.
  if (initial.box?.save && !incoming.save) throw new Error("Unlink the game save before importing a snapshot");
  const previous = preference.get();
  const independent = incoming.save === null;
  if (independent) preference.set(true);
  let restored = false;
  try {
    if (!initial.box && !await session.start(mode)) return false;
    const current = session.getSnapshot().box;
    if (!current || expectedBoxId !== undefined && current.id !== expectedBoxId) throw new Error("Card box changed during import");
    if (current.save && independent) throw new Error("Card box source changed during import");
    restored = await session.commit(mergeBoxBackup(current, incoming), current.revision);
    return restored;
  } finally {
    if (independent && !restored) preference.set(previous);
  }
}

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { GameServer } from "@/config/servers";
import { gameSaveBoxView, type GameSaveTables } from "@/lib/box/game-save";
import type { PlayerFieldCatalogue } from "@/lib/box/player-catalog";
import { getCardBoxSession } from "@/lib/box/session";
import { useLinkedGameSave } from "./use-game-save";

export function useCardBox(server: GameServer) {
  const session = useMemo(() => getCardBoxSession(server), [server]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => { void session.load(); }, [session]);
  return { ...snapshot, commit: session.commit.bind(session), start: session.start.bind(session),
    remove: session.remove.bind(session), reload: () => session.refresh(true) };
}

/**
 * The stored Box (`storage.box`, where every write starts) with the Box pages read (`box`): while a save is linked,
 * the Box the save describes, read with `tables` and `catalogue`.
 */
export function useCardBoxView(server: GameServer, tables: GameSaveTables | null, catalogue: PlayerFieldCatalogue | null) {
  const storage = useCardBox(server);
  const linkedSave = useLinkedGameSave(storage.box?.save ?? null);
  const save = linkedSave.state.status === "ready" ? linkedSave.state.save.player : null;
  const view = useMemo(() => gameSaveBoxView(storage.box, save, tables, catalogue), [storage.box, save, tables, catalogue]);
  return { storage, linkedSave, ...view };
}

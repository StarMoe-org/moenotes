import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { GameServer } from "@/config/servers";
import { getCardBoxSession } from "@/lib/box/session";

export function useCardBox(server: GameServer) {
  const session = useMemo(() => getCardBoxSession(server), [server]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => { void session.load(); }, [session]);
  return { ...snapshot, commit: session.commit.bind(session), start: session.start.bind(session),
    remove: session.remove.bind(session), reload: () => session.refresh(true) };
}

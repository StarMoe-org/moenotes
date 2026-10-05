import { useCallback, useEffect, useMemo, useState } from "react";
import { gameSaveServer } from "@/config/account";
import type { GameServer } from "@/config/servers";
import { useAccount } from "@/lib/account/use-account";
import { GameSaveError, listGameSaves, type GameSaveErrorCode, type GameSaveMeta } from "@/lib/account/game-saves";
import { openLinkedGameSave, type LinkedGameSaveResult } from "@/lib/box/game-save-source";
import type { BoxSaveLink } from "@/lib/box/model";

let listRequest: Promise<GameSaveMeta[]> | undefined;
export type GameSaveAccess = "loading" | "signed-in" | "signed-out" | "unavailable";
export interface GameSaveList {
  /** `unavailable` without the account API or without its save routes. */
  access: GameSaveAccess;
  /** The saves of this server's save server, newest first; null until listed. */
  saves: GameSaveMeta[] | null;
  error: GameSaveErrorCode | null;
  /** Lists again and answers this server's saves (null when listing failed). */
  refresh: () => Promise<GameSaveMeta[] | null>;
}

/** The signed-in user's uploaded saves that can hold `server`'s collection. Listed once per page unless refreshed. */
export function useGameSaveList(server: GameServer): GameSaveList {
  const account = useAccount();
  const [state, setState] = useState<{ saves: GameSaveMeta[] | null; error: GameSaveErrorCode | null }>({ saves: null, error: null });
  const target = gameSaveServer(server);
  const load = useCallback(async (fresh: boolean): Promise<GameSaveMeta[] | null> => {
    if (fresh) listRequest = undefined;
    const request = listRequest ??= listGameSaves();
    try {
      const saves = await request;
      setState({ saves, error: null });
      return saves;
    } catch (error) {
      if (listRequest === request) listRequest = undefined;
      setState({ saves: null, error: error instanceof GameSaveError ? error.code : "invalid" });
      return null;
    }
  }, []);
  useEffect(() => { if (account?.status === "signed-in") void load(false); }, [account?.status, load]);
  const access: GameSaveAccess = !account ? "loading" : account.status === "unavailable" || state.error === "not_found" ? "unavailable"
    : account.status === "signed-out" || state.error === "signed_out" ? "signed-out" : "signed-in";
  const saves = useMemo(() => state.saves?.filter(save => save.server === target) ?? null, [state.saves, target]);
  return { access, saves, error: state.error,
    refresh: async () => (await load(true))?.filter(save => save.server === target) ?? null };
}

export type LinkedGameSaveState = { status: "none" } | { status: "loading" } | LinkedGameSaveResult;

/** Opens the exact save version a Box links. */
export function useLinkedGameSave(link: BoxSaveLink | null): { state: LinkedGameSaveState; retry: () => void } {
  const key = link ? `${link.server}/${link.accountId}/${link.sha256}` : "";
  const [result, setResult] = useState<{ key: string; attempt: number; value: LinkedGameSaveResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!link) return;
    let active = true;
    void openLinkedGameSave(link).then(value => { if (active) setResult({ key, attempt, value }); });
    return () => { active = false; };
    // The link object changes with every Box revision; its key names the version.
  }, [key, attempt]);
  const state: LinkedGameSaveState = !link ? { status: "none" } : result?.key === key && result.attempt === attempt ? result.value : { status: "loading" };
  return { state, retry: () => setAttempt(value => value + 1) };
}

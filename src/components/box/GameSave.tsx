import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { accountLoginUrl } from "@/config/account";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import { GameSaveError, type GameSaveErrorCode, type GameSaveMeta } from "@/lib/account/game-saves";
import { gameSaveCounts, type GameSaveCounts, type GameSaveDerivation } from "@/lib/box/game-save";
import { fetchGameSave, type LoadedGameSave } from "@/lib/box/game-save-source";
import type { BoxSaveLink } from "@/lib/box/model";
import CollectionIcon from "./CollectionIcon";
import type { GameSaveList, LinkedGameSaveState } from "./use-game-save";

const dateTime = (locale: AppLocale, at: number) => new Date(at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
const errorCode = (error: unknown): GameSaveErrorCode => error instanceof GameSaveError ? error.code : "invalid";

/** A sign-in hint, or how to get a save into the account. Nothing while the account API is unavailable. */
export function GameSaveHint({ locale, server, list, returnTo }: { locale: AppLocale; server: GameServer; list: GameSaveList; returnTo: string }) {
  const gs = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.gameSave.${key}`, values);
  if (list.access === "signed-out") return <p className="cb-save-hint"><CollectionIcon name="game" /><span>{gs("signInPrompt")}</span><a href={accountLoginUrl(locale, returnTo)}>{gs("signIn")}</a></p>;
  if (list.access !== "signed-in") return null;
  if (list.error) return <p className="cb-save-hint"><CollectionIcon name="game" /><span>{gs("listError")}</span><button type="button" className="cb-save-hint-action" onClick={() => void list.refresh()}>{gs("retry")}</button></p>;
  if (list.saves?.length === 0) return <p className="cb-save-hint"><CollectionIcon name="game" /><span>{gs("noSaves", { server: t(locale, `gameServer.names.${server}`) })}</span></p>;
  return null;
}

type Entry = { status: "loading" } | { status: "ready"; save: LoadedGameSave; counts: GameSaveCounts } | { status: "error"; code: GameSaveErrorCode };

/** Lists the account's saves for this server with their card counts; choosing one links it to the Box. */
export function GameSavePicker({ locale, server, isOpen, onClose, list, busy, onLink }: {
  locale: AppLocale; server: GameServer; isOpen: boolean; onClose: () => void; list: GameSaveList; busy: boolean;
  onLink: (meta: GameSaveMeta, save: LoadedGameSave) => Promise<boolean>;
}) {
  const gs = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.gameSave.${key}`, values);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const known = useRef(entries); known.current = entries;
  const [linking, setLinking] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);
  const [changed, setChanged] = useState(false);
  const generation = useRef(0);
  const saves = list.saves;
  const entryKey = (meta: GameSaveMeta) => `${meta.server}/${meta.accountId}/${meta.sha256}`;
  useEffect(() => {
    if (!isOpen || !saves) return;
    const run = ++generation.current;
    void (async () => {
      for (const meta of saves) {
        const key = entryKey(meta);
        if (generation.current !== run) return;
        if (known.current[key]?.status === "ready") continue;
        setEntries(previous => previous[key]?.status === "ready" ? previous : { ...previous, [key]: { status: "loading" } });
        try {
          const save = await fetchGameSave(meta.server, meta.accountId);
          if (generation.current !== run) return;
          if (save.sha256 !== meta.sha256) {
            // A newer upload arrived after listing: list again so every entry names the bytes it shows.
            setChanged(true); void list.refresh(); return;
          }
          setEntries(previous => ({ ...previous, [key]: { status: "ready", save, counts: gameSaveCounts(save.player) } }));
        } catch (error) {
          if (generation.current === run) setEntries(previous => ({ ...previous, [key]: { status: "error", code: errorCode(error) } }));
        }
      }
    })();
    return () => { generation.current++; };
  }, [isOpen, saves]);
  useEffect(() => { if (isOpen) { setLinkError(false); setChanged(false); } }, [isOpen]);
  async function link(meta: GameSaveMeta) {
    const entry = entries[entryKey(meta)];
    if (entry?.status !== "ready" || busy || linking) return;
    setLinking(meta.accountId); setLinkError(false);
    const linked = await onLink(meta, entry.save).catch(() => false);
    setLinking(null);
    if (linked) onClose(); else setLinkError(true);
  }
  return <Modal historyNavigation={false} isOpen={isOpen} onClose={onClose} title={gs("pickerTitle")} closeLabel={t(locale, "deckWorkspace.close")} size="lg">
    <div className="dw-dialog cb-save-picker">
      <p className="dw-muted">{gs("pickerDescription")}</p>
      {changed && <p className="dw-muted" role="status">{gs("changedWhileOpen")}</p>}
      {saves === null ? list.error ? <p className="dw-alert" role="alert">{gs("listError")} <button type="button" onClick={() => void list.refresh()}>{gs("retry")}</button></p>
        : <p className="dw-muted" role="status">{gs("listLoading")}</p>
        : saves.length === 0 ? <p className="dw-muted">{gs("noSaves", { server: t(locale, `gameServer.names.${server}`) })}</p>
        : <ul className="cb-save-list">{saves.map(meta => {
          const entry = entries[entryKey(meta)];
          return <li key={entryKey(meta)} className="cb-save-entry">
            <span className="cb-save-entry-icon"><CollectionIcon name="game" /></span>
            <div className="cb-save-entry-copy">
              <strong>{gs("playerId", { id: meta.accountId })}</strong>
              <span>{gs("uploadedAt", { date: dateTime(locale, meta.uploadedAt) })}</span>
              <span>{entry?.status === "ready" ? gs("counts", { members: entry.counts.members, snaps: entry.counts.snaps }) : entry?.status === "error" ? gs(`errors.${entry.code}`) : gs("countsLoading")}</span>
            </div>
            <button type="button" className="dw-primary" disabled={busy || linking !== null || entry?.status !== "ready"} onClick={() => void link(meta)}>{gs(linking === meta.accountId ? "linking" : "link")}</button>
          </li>;
        })}</ul>}
      {linkError && <p className="dw-alert" role="alert">{gs("linkError")}</p>}
      <p className="dw-muted dw-small">{gs("privacy")}</p>
    </div>
  </Modal>;
}

type Check = { status: "idle" | "checking" | "current" | "missing" | "updating" } | { status: "available"; meta: GameSaveMeta } | { status: "error"; code: GameSaveErrorCode } | { status: "update-error" };

/** The linked save: where the Box's cards come from, with update and unlink. */
export function GameSaveBanner({ locale, link, state, derivation, list, busy, returnTo, onRetry, onUpdate, onUnlink }: {
  locale: AppLocale; link: BoxSaveLink; state: LinkedGameSaveState; derivation: GameSaveDerivation | null; list: GameSaveList; busy: boolean; returnTo: string;
  onRetry: () => void; onUpdate: (meta: GameSaveMeta) => Promise<boolean>; onUnlink: () => Promise<boolean>;
}) {
  const gs = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.gameSave.${key}`, values);
  const [check, setCheck] = useState<Check>({ status: "idle" });
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState(false);
  useEffect(() => { setCheck({ status: "idle" }); }, [link.sha256, link.accountId]);
  async function checkForUpdate() {
    if (list.access !== "signed-in") { setCheck({ status: "error", code: "signed_out" }); return; }
    setCheck({ status: "checking" });
    const saves = await list.refresh();
    if (!saves) { setCheck({ status: "error", code: "unavailable" }); return; }
    const meta = saves.find(save => save.server === link.server && save.accountId === link.accountId);
    setCheck(!meta ? { status: "missing" } : meta.sha256 === link.sha256 ? { status: "current" } : { status: "available", meta });
  }
  async function update(meta: GameSaveMeta) {
    setCheck({ status: "updating" });
    const updated = await onUpdate(meta).catch(() => false);
    setCheck(updated ? { status: "idle" } : { status: "update-error" });
  }
  const unknownCards = derivation?.issues.filter(issue => issue.code === "unknown_id" && /^_player\._(memberCards|supportCards)\[/.test(issue.path)).length ?? 0;
  const otherIssues = (derivation?.issues.length ?? 0) - unknownCards;
  const checking = check.status === "checking" || check.status === "updating";
  return <section className="cb-save-banner" aria-label={gs("source")} data-save-state={state.status}>
    <div className="cb-save-banner-main">
      <span className="cb-save-banner-icon"><CollectionIcon name="game" /></span>
      <div className="cb-save-banner-copy">
        <strong>{gs("source")}</strong>
        <span>{gs("playerId", { id: link.accountId })}<span aria-hidden="true"> · </span>{gs("uploadedAt", { date: dateTime(locale, link.uploadedAt) })}</span>
      </div>
      <div className="cb-save-banner-actions">
        <button type="button" className="cb-secondary-action" disabled={busy || checking} onClick={() => void checkForUpdate()}><CollectionIcon name="refresh" />{gs(check.status === "checking" ? "checking" : "checkUpdate")}</button>
        <button type="button" className="cb-secondary-action" disabled={busy} onClick={() => { setUnlinkError(false); setUnlinking(true); }}><CollectionIcon name="unlink" />{gs("unlink")}</button>
      </div>
    </div>
    <div className="cb-save-banner-status" role="status" aria-live="polite">
      {state.status === "loading" && <p>{gs("loading")}</p>}
      {state.status === "changed" && <p className="dw-alert">{gs("changed")}</p>}
      {state.status === "error" && <p className="dw-alert">{gs(`errors.${state.code}`)} {state.code === "signed_out" ? <a href={accountLoginUrl(locale, returnTo)}>{gs("signIn")}</a> : <button type="button" onClick={onRetry}>{gs("retry")}</button>}</p>}
      {check.status === "current" && <p>{gs("upToDate")}</p>}
      {check.status === "missing" && <p>{gs("notInAccount")}</p>}
      {check.status === "updating" && <p>{gs("updating")}</p>}
      {check.status === "update-error" && <p className="dw-alert">{gs("updateError")}</p>}
      {check.status === "error" && <p className="dw-alert">{check.code === "signed_out" ? <>{gs("signedOutUpdate")} <a href={accountLoginUrl(locale, returnTo)}>{gs("signIn")}</a></> : gs(`errors.${check.code}`)}</p>}
      {check.status === "available" && <p className="cb-save-update">{gs("updateAvailable", { date: dateTime(locale, check.meta.uploadedAt) })}
        <button type="button" className="dw-primary" disabled={busy} onClick={() => void update(check.meta)}>{gs("update")}</button></p>}
      {state.status === "ready" && unknownCards > 0 && <p>{gs("unknownCards", { count: unknownCards })}</p>}
      {state.status === "ready" && otherIssues > 0 && <p>{gs("issues", { count: otherIssues })}</p>}
    </div>
    <Modal historyNavigation={false} isOpen={unlinking} onClose={() => setUnlinking(false)} title={gs("unlinkTitle")} closeLabel={t(locale, "deckWorkspace.close")}>
      <div className="dw-dialog"><p>{gs("unlinkNote")}</p>{unlinkError && <p className="dw-alert" role="alert">{gs("unlinkError")}</p>}
        <button type="button" className="dw-danger" disabled={busy} onClick={async () => { const done = await onUnlink().catch(() => false); setUnlinkError(!done); if (done) setUnlinking(false); }}>{gs("unlinkConfirm")}</button></div>
    </Modal>
  </section>;
}

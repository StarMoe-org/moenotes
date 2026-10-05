import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { accountLoginUrl } from "@/config/account";
import { useAccount } from "@/lib/account/use-account";
import { refreshAccount } from "@/lib/account/client";
import { CloudBoxClient } from "@/lib/box/cloud";
import { CloudBoxSync, reviewCloudBox, type CloudMergeChoice } from "@/lib/box/cloud-sync";
import { getCardBoxSession } from "@/lib/box/session";
import type { CardBox } from "@/lib/box/model";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import CollectionIcon from "./CollectionIcon";

interface Props { locale: AppLocale; server: GameServer; box: CardBox | null; busy: boolean; returnTo: string }
export default function CloudBoxPanel(props: Props) {
  const account = useAccount();
  const userId = account?.status === "signed-in" && typeof account.user.id === "string" ? account.user.id : "";
  const scope = JSON.stringify([userId, props.server, props.box?.id ?? null, props.box?.save ?? null]);
  const current = useRef(scope); current.current = scope;
  const previousUser = useRef(userId);
  const [accountChanged, setAccountChanged] = useState(false);
  useEffect(() => {
    if (previousUser.current && previousUser.current !== userId) setAccountChanged(true);
    previousUser.current = userId;
  }, [userId]);
  const tr = (key: string) => t(props.locale, `deckWorkspace.cloud.${key}`);
  if (!account) return <p className="cb-cloud-note" role="status">{tr("loading")}</p>;
  if (account.status === "signed-out") return <div className="cb-cloud-note"><CollectionIcon name="cloud" /><span>{tr("signedOut")}</span><a href={accountLoginUrl(props.locale, props.returnTo)}>{tr("signIn")}</a></div>;
  if (!userId) return <p className="cb-cloud-note" role="status">{tr("unavailable")}</p>;
  return <>{accountChanged && <p className="cb-cloud-note" role="alert">{tr("accountChanged")}</p>}
    <SignedInCloud key={scope} {...props} userId={userId} accountName={account.status === "signed-in" ? account.user.name ?? account.user.username : null} isCurrent={() => current.current === scope} /></>;
}

function SignedInCloud({ locale, server, box, busy, returnTo, userId, accountName, isCurrent }: Props & { userId: string; accountName: string | null; isCurrent: () => boolean }) {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const sync = useMemo(() => {
    const active = () => alive.current && isCurrent();
    return new CloudBoxSync(new CloudBoxClient({ userId, server, association: null }, { isCurrent: active }), active);
  }, [userId, server]);
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
  useEffect(() => { void sync.read(); }, [sync]);
  useEffect(() => { if (state.error === "stale_scope") void refreshAccount(); }, [state.error]);
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.cloud.${key}`, values);
  const [review, setReview] = useState<{ box: CardBox | null; cloud: CardBox; revision: string } | null>(null);
  const [choice, setChoice] = useState<CloudMergeChoice>("merge");
  const [saveSource, setSaveSource] = useState<"device" | "cloud">("device");
  const [deletion, setDeletion] = useState<{ revision: string; boxId: string } | null>(null);
  const [localError, setLocalError] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const pendingAdoption = useRef<{ next: CardBox; expected: { id: string; revision: number } | null } | null>(null);
  const working = busy || adopting || ["loading", "saving", "deleting"].includes(state.status);
  const remote = state.remote;
  const synced = sync.matches(box);
  const reviewStale = !!review && ((box?.id ?? null) !== (review.box?.id ?? null) || (box?.revision ?? null) !== (review.box?.revision ?? null) || remote?.revision !== review.revision);
  const saveDiffers = review && JSON.stringify(review.box?.save ?? null) !== JSON.stringify(review.cloud.save);
  const status = state.status === "loading" || state.status === "idle" ? "loading" : state.status === "saving" ? "saving"
    : state.status === "deleting" ? "deleting" : synced ? "synced" : remote?.box ? sync.needsReview(box) ? "reviewNeeded" : "changed" : "notSaved";
  function openReview() {
    if (!remote?.box || !remote.revision) return;
    setReview({ box: box ? structuredClone(box) : null, cloud: structuredClone(remote.box), revision: remote.revision });
    setChoice(box ? "merge" : "cloud"); setSaveSource(box?.save ? "device" : "cloud"); setLocalError(false); pendingAdoption.current = null;
  }
  async function adoptReviewed() {
    const planned = pendingAdoption.current;
    if (!planned || !isCurrent()) return false;
    const done = await getCardBoxSession(server).adopt(planned.next, planned.expected);
    if (!alive.current || !isCurrent()) return false;
    setLocalError(!done); pendingAdoption.current = null;
    if (done) setReview(null); else sync.requireReview();
    return done;
  }
  async function retry() {
    const method = state.retrying;
    setAdopting(true);
    try {
      const saved = await sync.retry();
      if (saved && isCurrent()) {
        if (method === "PUT") await adoptReviewed();
        else { pendingAdoption.current = null; setDeletion(null); }
      } else if (!sync.getSnapshot().retrying) pendingAdoption.current = null;
    } finally { if (alive.current) setAdopting(false); }
  }
  async function applyReview() {
    if (!review || reviewStale || working || !isCurrent()) return;
    const expected = review.box ? { id: review.box.id, revision: review.box.revision } : null;
    setLocalError(false); setAdopting(true);
    try {
      const next = reviewCloudBox(review.box, review.cloud, choice, saveSource);
      pendingAdoption.current = { next, expected };
      if (choice !== "cloud") {
        const saved = await sync.save(next, review.revision);
        if (!saved || !isCurrent()) {
          if (!sync.getSnapshot().retrying) pendingAdoption.current = null;
          return;
        }
      }
      const adopted = await adoptReviewed();
      if (choice === "cloud" && adopted) sync.accept(review.revision);
    } catch { if (alive.current && isCurrent()) setLocalError(true); }
    finally { if (alive.current) setAdopting(false); }
  }
  const cloudCounts = (value: CardBox | null) => value?.save ? tr("linkedSave") : tr("counts", {
    members: value?.cards.filter(card => card.kind === "member").length ?? 0,
    snaps: value?.cards.filter(card => card.kind === "snap").length ?? 0,
  });
  return <section className="cb-cloud-sync" aria-label={tr("title")} data-cloud-state={state.status}>
    <div className="cb-cloud-summary"><CollectionIcon name="cloud" /><div><strong>{tr("title")}{accountName && <> · {accountName}</>}</strong>
      <span role="status" aria-live="polite">{tr(status)}{synced && remote?.updatedAt !== null && remote?.updatedAt !== undefined && <> · {new Date(remote.updatedAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</>}</span></div></div>
    <div className="cb-cloud-actions">
      {state.retrying ? <button type="button" disabled={working || state.error === "signed_out"} onClick={() => void retry()}>{tr("retry")}</button>
        : <>
          {remote?.box && sync.needsReview(box) ? <button type="button" disabled={working} onClick={openReview}>{tr(box ? "review" : "restore")}</button>
            : <button type="button" disabled={working || !box || !remote || synced} onClick={() => box && void sync.save(box)}>{tr("save")}</button>}
          <button type="button" disabled={working} onClick={() => void sync.read()} aria-label={tr("refresh")}><CollectionIcon name="refresh" />{tr("refresh")}</button>
          {remote?.box && remote.revision && <button type="button" className="cb-cloud-delete" disabled={working} onClick={() => { pendingAdoption.current = null; setDeletion({ revision: remote.revision!, boxId: remote.box!.id }); }}>{tr("delete")}</button>}
        </>}
    </div>
    {state.error && <p className="cb-cloud-error" role="alert">{tr(`errors.${state.error}`)} {state.error === "signed_out" && <a href={accountLoginUrl(locale, returnTo)}>{tr("signIn")}</a>}</p>}
    <Modal historyNavigation={false} isOpen={!!review} onClose={() => { if (!working) setReview(null); }} title={tr("reviewTitle")} closeLabel={t(locale, "deckWorkspace.close")}>
      {review && <div className="dw-dialog cb-cloud-review">
        <dl><div><dt>{tr("device")}</dt><dd>{cloudCounts(review.box)}</dd></div><div><dt>{tr("cloud")}</dt><dd>{cloudCounts(review.cloud)}</dd></div></dl>
        <p>{tr("reviewNote")}</p>
        {review.box && <fieldset disabled={working}><legend>{tr("choose")}</legend>{(["merge", "device", "cloud"] as const).map(value => <label key={value}>
          <input type="radio" name="cloud-choice" value={value} checked={choice === value} onChange={() => setChoice(value)} /><span><strong>{tr(`choices.${value}`)}</strong><small>{tr(`choices.${value}Note`)}</small></span>
        </label>)}</fieldset>}
        {choice === "merge" && saveDiffers && <label className="cb-cloud-save-choice">{tr("saveSource")}<select value={saveSource} disabled={working} onChange={event => setSaveSource(event.target.value as "device" | "cloud")}>
          <option value="device">{tr("device")} · {review.box?.save ? tr("linkedSave") : tr("manualCollection")}</option><option value="cloud">{tr("cloud")} · {review.cloud.save ? tr("linkedSave") : tr("manualCollection")}</option>
        </select></label>}
        {reviewStale && <p className="dw-alert" role="alert">{tr("staleReview")} <button type="button" onClick={openReview}>{tr("reviewAgain")}</button></p>}
        {localError && <p className="dw-alert" role="alert">{tr("localError")}</p>}
        {state.error && <p className="dw-alert" role="alert">{tr(`errors.${state.error}`)}</p>}
        {state.retrying && <button type="button" disabled={working || state.error === "signed_out"} onClick={() => void retry()}>{tr("retry")}</button>}
        <button type="button" className="dw-primary" disabled={working || reviewStale || !!state.retrying} onClick={() => void applyReview()}>{tr(choice === "cloud" ? "useCloud" : "confirmSync")}</button>
      </div>}
    </Modal>
    <Modal historyNavigation={false} isOpen={!!deletion} onClose={() => { if (!working) setDeletion(null); }} title={tr("deleteTitle")} closeLabel={t(locale, "deckWorkspace.close")}>
      <div className="dw-dialog"><p>{tr("deleteNote")}</p>{state.error && <p className="dw-alert" role="alert">{tr(`errors.${state.error}`)}</p>}
        {state.retrying && <button type="button" disabled={working || state.error === "signed_out"} onClick={() => void retry()}>{tr("retry")}</button>}
        <button type="button" className="dw-danger" disabled={working || !!state.retrying || !deletion || deletion.revision !== remote?.revision} onClick={async () => {
          if (deletion && await sync.remove(deletion.revision, deletion.boxId)) setDeletion(null);
        }}>{tr("confirmDelete")}</button></div>
    </Modal>
  </section>;
}

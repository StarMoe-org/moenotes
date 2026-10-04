import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { accountApi } from "@/config/account";
import { openPlatformRequest as api, publicAppPath } from "@/lib/account/open-platform";
import Modal from "@/components/shared/Modal";

type Save = { server: string; accountId: string };
type PublicApp = { clientID: string; name: string };
type Grant = { applicationName?: string; clientID: string; saveServer: string; accountID: string; createdAt: number };
type ConfirmGrant = Grant | null;

import { accountButton as btn, accountPrimary as primary, accountInput as input } from "./ui-styles";
import { createOperationGate, toggleSelection } from "@/lib/account/ui-state.mjs";

export default function SaveAuthorizations({ locale, panel }: { locale: AppLocale; panel: string }) {
  const gate = useRef(createOperationGate());
  const [saves, setSaves] = useState<Save[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [clientID, setClientID] = useState("");
  const [found, setFound] = useState<PublicApp | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [partialFailure, setPartialFailure] = useState(false);
  const [savesFailed, setSavesFailed] = useState(false);
  const [grantsFailed, setGrantsFailed] = useState(false);
  const [confirmGrant, setConfirmGrant] = useState<ConfirmGrant>(null);

  async function load() {
    const results = await Promise.allSettled([api<{ saves: Save[] }>(accountApi.saves), api<{ authorizations: Grant[] }>(accountApi.saveAuthorizations)]);
    const [s, g] = results;
    setSavesFailed(s.status === "rejected");
    setGrantsFailed(g.status === "rejected");
    setPartialFailure(results.some((result) => result.status === "rejected"));
    if (s.status === "fulfilled") setSaves(s.value.saves || []);
    if (g.status === "fulfilled") {
      const authorizations = g.value.authorizations || [];
      const names = new Map<string, string>();
      await Promise.all([...new Set(authorizations.filter((grant) => !grant.applicationName).map((grant) => grant.clientID))].map(async (id) => {
        try { const result = await api<{ application: PublicApp }>(publicAppPath(id)); names.set(id, result.application.name); } catch { /* existing grants remain visible with a fallback label */ }
      }));
      setGrants(authorizations.map((grant) => ({ ...grant, applicationName: grant.applicationName || names.get(grant.clientID) || t(locale, "openPlatform.unavailable") })));
    }
    setLoaded(true);
    if (results.some((result) => result.status === "rejected")) throw new Error("load");
  }

  async function run(call: () => Promise<void>) {
    if (!gate.current.enter()) return;
    setBusy(true); setFailed(false); setMessage("");
    try { await call(); } catch { setFailed(true); setMessage(t(locale, "openPlatform.error")); }
    finally { gate.current.leave(); setBusy(false); }
  }

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) setClientID(invite);
    void run(async () => {
      const results = await Promise.allSettled([load(), ...(invite ? [lookup(invite)] : [])]);
      if (results.some((result) => result.status === "rejected")) throw new Error("load");
    });
  }, []);

  async function lookup(id = clientID) {
    const value = id.trim();
    if (!value) return;
    setFound(null); setSelected([]);
    const result = await api<{ application: PublicApp }>(publicAppPath(value));
    setFound(result.application);
  }

  async function authorize() {
    if (!found || !selected.length) return;
    try {
      for (const id of selected) {
        const [saveServer, accountID] = id.split("/");
        await api(accountApi.saveAuthorizations, "POST", { clientID: found.clientID, saveServer, accountID });
        setSelected((current) => current.filter((value) => value !== id));
      }
    } finally { await load(); }
  }

  async function revoke(grant: Grant) {
    await api(`${accountApi.saveAuthorizations}/${encodeURIComponent(grant.clientID)}/${encodeURIComponent(grant.saveServer)}/${encodeURIComponent(grant.accountID)}`, "DELETE");
    await load();
  }

  return <section className={panel} aria-busy={busy}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-black text-[var(--mn-text)]">{t(locale, "openPlatform.grants")}</h2><p className="mt-1 max-w-2xl text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.grantsHint")}</p></div><button type="button" className={btn} disabled={busy} onClick={() => void run(load)}>{t(locale, "openPlatform.refresh")}</button></div>
    {partialFailure && <p className="mt-3 rounded-xl border border-[var(--mn-rose)]/40 p-3 text-xs text-[var(--mn-rose)]" role="alert">{t(locale, "openPlatform.partialLoadError")} <button type="button" className="ml-1 font-bold underline" onClick={() => void run(load)}>{t(locale, "openPlatform.retry")}</button></p>}
    <form className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); void run(lookup); }}><label className="min-w-0 flex-1"><span className="mb-1 block text-xs font-bold">{t(locale, "openPlatform.clientId")}</span><input disabled={busy} className={input} required value={clientID} onChange={(event) => { setClientID(event.target.value); setFound(null); setSelected([]); }} /></label><button className={primary} disabled={busy || !clientID.trim()}>{t(locale, "openPlatform.lookup")}</button></form>

    {found && <div className="mt-5 border-t border-[var(--mn-border)] pt-5"><p className="text-xs font-black uppercase tracking-wide text-[var(--mn-text-muted)]">{t(locale, "openPlatform.applicationFound")}</p><h3 className="mt-1 text-base font-black">{found.name}</h3><code className="mt-1 block break-all text-xs text-[var(--mn-text-muted)]">{found.clientID}</code><p className="mt-3 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.consent")}</p><fieldset className="mt-4"><legend className="text-xs font-bold">{t(locale, "openPlatform.choose")}</legend>{!saves.length ? <p className="mt-2 rounded-xl border border-dashed border-[var(--mn-border)] p-3 text-xs text-[var(--mn-text-muted)]">{t(locale, savesFailed ? "openPlatform.partialLoadError" : "openPlatform.emptyArchives")}</p> : <div className="mt-2 grid gap-2 sm:grid-cols-2">{saves.map((save) => { const id = `${save.server}/${save.accountId}`; const checked = selected.includes(id); return <label key={id} className={`mn-list-card mn-card relative flex cursor-pointer items-start gap-3 p-5 text-sm focus-within:ring-2 focus-within:ring-[var(--mn-accent)]/40 ${checked ? "border-[var(--mn-accent)] bg-[var(--mn-accent-soft)] ring-2 ring-[var(--mn-accent)]/40" : "bg-[var(--mn-paper)]"}`}><input className="mt-0.5 h-4 w-4" type="checkbox" disabled={busy} checked={checked} onChange={(event) => setSelected((current) => toggleSelection(current, id, event.target.checked))} /><span><strong className="block">{save.accountId}</strong><span className="text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.saveServer")}: {save.server}</span></span></label>; })}</div>}</fieldset><button type="button" className={`${primary} mt-4`} disabled={busy || !selected.length} onClick={() => void run(authorize)}>{t(locale, "openPlatform.authorize")}{selected.length ? ` (${selected.length})` : ""}</button></div>}

    <div className="mt-6"><h3 className="text-xs font-black uppercase tracking-wide text-[var(--mn-text-muted)]">{t(locale, "openPlatform.currentGrants")}</h3><ul className="mt-2 divide-y divide-dashed divide-[var(--mn-border)]/60">{loaded && !grantsFailed && !grants.length && <li className="py-3 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.emptyGrants")}</li>}{grants.map((grant) => <li key={`${grant.clientID}/${grant.saveServer}/${grant.accountID}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0"><strong className="block truncate">{grant.applicationName}</strong><span className="block break-all text-xs text-[var(--mn-text-muted)]">{grant.clientID} · {grant.saveServer}/{grant.accountID}</span><span className="block text-xs text-[var(--mn-text-muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(grant.createdAt))}</span></span><button type="button" className={`${btn} text-[var(--mn-rose)]`} disabled={busy} onClick={() => setConfirmGrant(grant)}>{t(locale, "openPlatform.revoke")}</button></li>)}</ul></div>
    {message && <p role={failed ? "alert" : "status"} className={`mt-3 text-xs ${failed ? "text-[var(--mn-rose)]" : "text-[var(--mn-text-muted)]"}`}>{message}</p>}
    <Modal isOpen={Boolean(confirmGrant)} onClose={() => setConfirmGrant(null)} title={t(locale, "openPlatform.confirmRevokeTitle")} closeLabel={t(locale, "actions.close")} size="sm"><p className="text-sm text-[var(--mn-text-muted)]">{t(locale, "openPlatform.confirmRevoke")}</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setConfirmGrant(null)}>{t(locale, "actions.cancel")}</button><button type="button" className={`${btn} text-[var(--mn-rose)]`} disabled={busy} onClick={() => { const grant = confirmGrant; setConfirmGrant(null); if (grant) void run(() => revoke(grant)); }}>{t(locale, "openPlatform.confirm")}</button></div></Modal>
  </section>;
}

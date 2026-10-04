import { useEffect, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { accountApi } from "@/config/account";
import { openPlatformRequest as api, publicAppPath } from "@/lib/account/open-platform";

type Save = { server: string; accountId: string };
type PublicApp = { clientID: string; name: string };
type Grant = { applicationName?: string; clientID: string; saveServer: string; accountID: string; createdAt: number };

const btn = "mn-focus mn-stamp-press inline-flex min-h-9 items-center rounded-xl border-[1.5px] border-[var(--mn-border)] px-3 text-xs font-black hover:bg-[var(--mn-cream-deep)] disabled:opacity-50";
const input = "w-full rounded-xl border border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-2 text-sm";

/**
 * The user's own side of the open platform: which applications may read which uploaded save. It belongs to the
 * account page, not the developer console, because granting and revoking access is the user's decision.
 * `?invite=<clientID>` only prefills the lookup; the user still confirms the specific archives.
 */
export default function SaveAuthorizations({ locale, panel }: { locale: AppLocale; panel: string }) {
  const [saves, setSaves] = useState<Save[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [clientID, setClientID] = useState("");
  const [found, setFound] = useState<PublicApp | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const results = await Promise.allSettled([
      api<{ saves: Save[] }>(accountApi.saves),
      api<{ authorizations: Grant[] }>(accountApi.saveAuthorizations),
    ]);
    const [s, g] = results;
    if (s.status === "fulfilled") setSaves(s.value.saves || []);
    if (g.status === "fulfilled") {
      const authorizations = g.value.authorizations || [];
      // A revoked or paused application no longer answers the public lookup; its grants stay revocable.
      const names = new Map<string, string>();
      await Promise.all([...new Set(authorizations.filter((grant) => !grant.applicationName).map((grant) => grant.clientID))].map(async (id) => {
        try { const result = await api<{ application: PublicApp }>(publicAppPath(id)); names.set(id, result.application.name); } catch { /* keep the placeholder name */ }
      }));
      setGrants(authorizations.map((grant) => ({ ...grant, applicationName: grant.applicationName || names.get(grant.clientID) || t(locale, "openPlatform.unavailable") })));
    }
    setLoaded(true);
    if (results.some((result) => result.status === "rejected")) throw new Error("load");
  }
  async function run(call: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setFailed(false); setMessage("");
    try { await call(); } catch { setFailed(true); setMessage(t(locale, "openPlatform.error")); } finally { setBusy(false); }
  }
  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) setClientID(invite);
    void run(async () => {
      await Promise.all([load(), ...(invite ? [lookup(invite)] : [])]);
    });
  }, []);
  async function lookup(id = clientID) {
    setFound(null); setSelected([]);
    const result = await api<{ application: PublicApp }>(publicAppPath(id.trim()));
    setFound(result.application);
  }
  async function authorize() {
    if (!found || !selected.length) return;
    try {
      for (const id of selected) {
        const [saveServer, accountID] = id.split("/");
        await api(accountApi.saveAuthorizations, "POST", { clientID: found.clientID, saveServer, accountID });
      }
      setSelected([]);
    } finally { await load(); }
  }
  return <section className={panel} aria-busy={busy}>
    <h2 className="text-sm font-black text-[var(--mn-text)]">{t(locale, "openPlatform.grants")}</h2>
    <p className="mt-1 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.grantsHint")}</p>
    <form className="mt-4 flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void run(lookup); }}>
      <label className="min-w-0 flex-1"><span className="mb-1 block text-xs">{t(locale, "openPlatform.clientId")}</span><input className={input} required value={clientID} onChange={(event) => { setClientID(event.target.value); setFound(null); setSelected([]); }} /></label>
      <button className={btn} disabled={busy || !clientID.trim()}>{t(locale, "openPlatform.lookup")}</button>
    </form>
    {found && <div className="mt-3 rounded-xl border border-[var(--mn-border)] p-3">
      <b>{found.name}</b><p className="mt-1 break-all text-xs">{found.clientID}</p>
      <p className="mt-3 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.consent")}</p>
      <fieldset className="mt-3 space-y-2"><legend className="mb-2 text-xs font-bold">{t(locale, "openPlatform.choose")}</legend>
        {!saves.length && <p className="text-xs">{t(locale, "openPlatform.emptyArchives")}</p>}
        {saves.map((save) => { const id = `${save.server}/${save.accountId}`; return <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={selected.includes(id)} onChange={(event) => setSelected(event.target.checked ? [...selected, id] : selected.filter((x) => x !== id))} />{id}</label>; })}
      </fieldset>
      <button type="button" className={`${btn} mt-3`} disabled={busy || !selected.length} onClick={() => void run(authorize)}>{t(locale, "openPlatform.authorize")}</button>
    </div>}
    <ul className="mt-4 divide-y divide-dashed divide-[var(--mn-border)]/60">
      {loaded && !grants.length && <li className="text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.emptyGrants")}</li>}
      {grants.map((grant) => <li key={`${grant.clientID}/${grant.saveServer}/${grant.accountID}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span className="break-all">{grant.applicationName}<span className="block text-xs">{grant.clientID} · {grant.saveServer}/{grant.accountID}</span><span className="block text-xs text-[var(--mn-text-muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(grant.createdAt))}</span></span>
        <button type="button" className={btn} disabled={busy} onClick={() => { if (window.confirm(t(locale, "openPlatform.confirmRevoke"))) void run(async () => { await api(`${accountApi.saveAuthorizations}/${encodeURIComponent(grant.clientID)}/${encodeURIComponent(grant.saveServer)}/${encodeURIComponent(grant.accountID)}`, "DELETE"); await load(); }); }}>{t(locale, "openPlatform.revoke")}</button>
      </li>)}
    </ul>
    {message && <p role={failed ? "alert" : "status"} className={`mt-3 text-xs ${failed ? "text-[var(--mn-danger,#ba1b1b)]" : "text-[var(--mn-text-muted)]"}`}>{message}</p>}
  </section>;
}

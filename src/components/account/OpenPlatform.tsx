import { useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import { accountApi } from "@/config/account";
import { openPlatformRequest as api } from "@/lib/account/open-platform";
import Modal from "@/components/shared/Modal";
import SectionHeading from "@/components/shared/SectionHeading";

type Key = { id: string; prefix: string; revokedAt: number | null };
type App = { id: string; name: string; enabled: boolean; scopes: string[]; regions: string[]; keys?: Key[]; keyError?: boolean };
type ConfirmAction = { kind: "rotate" | "revoke"; app: App; key?: Key } | null;

import { accountButton as btn, accountPrimary as primary, accountInput as input } from "./ui-styles";
import { createOperationGate, canIssueKey } from "@/lib/account/ui-state.mjs";

export default function OpenPlatform({ locale, panel }: { locale: AppLocale; panel: string }) {
  const gate = useRef(createOperationGate());
  const [apps, setApps] = useState<App[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [options, setOptions] = useState({ scopes: [] as string[], regions: [] as string[] });
  const [secret, setSecret] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);

  const selected = apps.find((app) => app.id === selectedId) ?? apps[0] ?? null;
  const activeKeys = useMemo(() => (selected?.keys ?? []).filter((key) => !key.revokedAt), [selected]);

  async function load() {
    setLoading(true);
    try {
      const result = await api<{ applications: App[]; scopes: string[]; regions: string[] }>(accountApi.developerApps);
      const withKeys = await Promise.all(result.applications.map(async (app) => {
        try {
          const keys = await api<{ keys: Key[] }>(`${accountApi.developerApps}/${encodeURIComponent(app.id)}/keys`);
          return { ...app, keys: keys.keys || [], keyError: false };
        } catch {
          return { ...app, keyError: true };
        }
      }));
      setApps(withKeys);
      setSelectedId((current) => current && withKeys.some((app) => app.id === current) ? current : withKeys[0]?.id ?? null);
      setOptions({ scopes: result.scopes || [], regions: result.regions || [] });
      setFailed(false);
      setMessage("");
    } catch {
      setFailed(true);
      setMessage(t(locale, "openPlatform.error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void run(load); }, []);

  async function run(call: () => Promise<void>) {
    if (!gate.current.enter()) return;
    setBusy(true); setFailed(false); setMessage("");
    try { await call(); } catch { setFailed(true); setMessage(t(locale, "openPlatform.error")); }
    finally { gate.current.leave(); setBusy(false); }
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || loading || !options.scopes.length || !options.regions.length) return;
    setSecret(null);
    const result = await api<{ application: App }>(accountApi.developerApps, "POST", { name: trimmed, scopes: options.scopes, regions: options.regions });
    setName("");
    setApps((current) => [...current, result.application]);
    setSelectedId(result.application.id);
    try { await issue(result.application); }
    catch {
      await load();
      setFailed(true);
      setMessage(t(locale, "openPlatform.createdKeyFailed"));
    }
  }

  async function issue(app: App) {
    if (!canIssueKey(app)) {
      setMessage(t(locale, "openPlatform.keyLimit"));
      return;
    }
    setSecret(null);
    const result = await api<{ secret: string }>(`${accountApi.developerApps}/${encodeURIComponent(app.id)}/keys`, "POST");
    setSecret(result.secret);
    await load();
  }

  async function revokeKey(app: App, key: Key) {
    await api(`${accountApi.developerApps}/${encodeURIComponent(app.id)}/keys/${encodeURIComponent(key.id)}`, "DELETE");
    setSecret(null);
    await load();
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setFailed(false); setMessage(t(locale, "openPlatform.copied")); }
    catch { setFailed(true); setMessage(t(locale, "openPlatform.copyFailed")); }
  }

  const inviteLink = (id: string) => `${window.location.origin}${localizePath(getRoutePathById("account"), locale)}?invite=${encodeURIComponent(id)}`;

  return <div className="space-y-6" aria-busy={busy || loading}>
    <section className={panel}>
      <SectionHeading title={t(locale, "openPlatform.developer")}>
        <button type="button" className={btn} disabled={busy || loading} onClick={() => void run(load)}>{t(locale, "openPlatform.refresh")}</button>
      </SectionHeading>
      <p className="mt-3 max-w-2xl text-sm text-[var(--mn-text-muted)]">{t(locale, "openPlatform.developerHint")}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <div>
          <h3 className="text-sm font-black">{t(locale, "openPlatform.appsTitle")}</h3>
          {loading && <p className="mt-3 text-xs text-[var(--mn-text-muted)]" role="status">{t(locale, "openPlatform.loading")}</p>}
          {!loading && !failed && !apps.length && <p className="mt-3 rounded-xl border border-dashed border-[var(--mn-border)] p-4 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.emptyApps")}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {apps.map((app) => <button key={app.id} type="button" aria-pressed={selected?.id === app.id} onClick={() => setSelectedId(app.id)} className={`mn-focus mn-list-card mn-card relative p-5 text-left ${selected?.id === app.id ? "border-[var(--mn-accent)] bg-[var(--mn-accent-soft)] ring-2 ring-[var(--mn-accent)]/40" : "bg-[var(--mn-paper)]"}`}>
              <div className="flex items-start justify-between gap-2"><span className="truncate font-black">{app.name}</span><span className="shrink-0 text-[11px] text-[var(--mn-text-muted)]">{t(locale, `openPlatform.${app.enabled ? "ready" : "disabled"}`)}</span></div>
              <code className="mt-2 block truncate text-xs text-[var(--mn-text-muted)]">{app.id}</code>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-[var(--mn-text-muted)]"><span>{app.scopes?.length || 0} {t(locale, "openPlatform.scopesCount")}</span><span aria-hidden="true">·</span><span>{app.regions?.length || 0} {t(locale, "openPlatform.regionsCount")}</span><span aria-hidden="true">·</span><span>{app.keys?.filter((key) => !key.revokedAt).length ?? "—"}/2 {t(locale, "openPlatform.keysCount")}</span></div>
            </button>)}
          </div>
        </div>

        <form className="border-t border-[var(--mn-border)] pt-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0" onSubmit={(event) => { event.preventDefault(); void run(create); }}>
          <h3 className="text-sm font-black">{t(locale, "openPlatform.createTitle")}</h3>
          <p className="mt-1 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.createHint")}</p>
          <label className="mt-4 block"><span className="mb-1 block text-xs font-bold">{t(locale, "openPlatform.name")}</span><input disabled={busy} className={input} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <button className={`${primary} mt-5 w-full`} disabled={busy || loading || !name.trim() || !options.scopes.length || !options.regions.length}>{t(locale, "openPlatform.create")}</button>
        </form>
      </div>
    </section>

    {selected && <section className={panel} aria-labelledby="open-platform-detail">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="open-platform-detail" className="text-lg font-black">{selected.name}</h2><p className="mt-1 break-all text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.clientId")}: <code>{selected.id}</code></p></div><div className="flex flex-wrap gap-2"><button type="button" className={btn} onClick={() => void copy(selected.id)}>{t(locale, "openPlatform.copy")}</button><button type="button" className={btn} onClick={() => void copy(inviteLink(selected.id))}>{t(locale, "openPlatform.invite")}</button></div></div>
      <div className="mt-5 grid gap-5 md:grid-cols-2"><div><h3 className="text-xs font-black uppercase tracking-wide text-[var(--mn-text-muted)]">{t(locale, "openPlatform.permissions")}</h3><p className="mt-2 text-sm text-[var(--mn-text-muted)]">{t(locale, "openPlatform.permissionsHint")}</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-bold">{t(locale, "openPlatform.regionsLabel")}</span>{selected.regions?.map((region) => <span key={region} className="mn-stamp rounded-xl px-3 py-1.5 text-xs">{region}</span>)}</div></div><div><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-black uppercase tracking-wide text-[var(--mn-text-muted)]">{t(locale, "openPlatform.keysTitle")}</h3><button type="button" className={primary} disabled={busy || !selected.enabled || activeKeys.length >= 2 || selected.keyError} onClick={() => void run(() => issue(selected))}>{t(locale, "openPlatform.generate")}</button></div>{selected.keyError ? <p className="mt-3 rounded-xl border border-[var(--mn-rose)]/40 p-3 text-xs text-[var(--mn-rose)]">{t(locale, "openPlatform.keysLoadError")} <button type="button" className="ml-1 font-bold underline" onClick={() => void run(load)}>{t(locale, "openPlatform.retry")}</button></p> : activeKeys.length ? <ul className="mt-3 space-y-2">{activeKeys.map((key) => <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mn-border)] p-3 text-xs"><span><code>{key.prefix}…</code><span className="ml-2 text-[var(--mn-text-muted)]">{t(locale, "openPlatform.secretActive")}</span></span><button type="button" className={`${btn} text-[var(--mn-rose)]`} disabled={busy} onClick={() => setConfirm({ kind: "revoke", app: selected, key })}>{t(locale, "openPlatform.revokeSecret")}</button></li>)}</ul> : <p className="mt-3 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.emptyKeys")}</p>}{activeKeys.length >= 2 && <p className="mt-2 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.keyLimit")}</p>}<button type="button" className={`${btn} mt-3`} disabled={busy || !canIssueKey(selected) || !activeKeys.length} onClick={() => setConfirm({ kind: "rotate", app: selected })}>{t(locale, "openPlatform.rotate")}</button></div></div>
    </section>}

    {secret && <section className={`${panel} border-[var(--mn-accent)]`}><h2 className="text-sm font-black">{t(locale, "openPlatform.secret")}</h2><p className="mt-1 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.secretHint")}</p><code className="mt-3 block select-all break-all rounded-xl bg-[var(--mn-cream-deep)] p-3 text-xs">{secret}</code><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primary} onClick={() => void copy(secret)}>{t(locale, "openPlatform.copy")}</button><button type="button" className={btn} onClick={() => setSecret(null)}>{t(locale, "openPlatform.dismiss")}</button></div></section>}
    {message && <p role={failed ? "alert" : "status"} className={`text-xs ${failed ? "text-[var(--mn-rose)]" : "text-[var(--mn-text-muted)]"}`}>{message}</p>}

    <Modal isOpen={Boolean(confirm)} onClose={() => setConfirm(null)} title={t(locale, confirm?.kind === "rotate" ? "openPlatform.confirmRotateTitle" : "openPlatform.confirmRevokeTitle")} closeLabel={t(locale, "actions.close")} size="sm">
      <p className="text-sm text-[var(--mn-text-muted)]">{t(locale, confirm?.kind === "rotate" ? "openPlatform.confirmRotate" : "openPlatform.confirmRevoke")}</p>
      <div className="mt-5 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setConfirm(null)}>{t(locale, "actions.cancel")}</button><button type="button" className={`${btn} text-[var(--mn-rose)]`} disabled={busy} onClick={() => { const action = confirm; setConfirm(null); if (!action) return; void run(() => action.kind === "rotate" ? issue(action.app) : revokeKey(action.app, action.key!)); }}>{t(locale, "openPlatform.confirm")}</button></div>
    </Modal>
  </div>;
}

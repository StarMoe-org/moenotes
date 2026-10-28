"use client";

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
      <p className="mt-3 max-w-2xl text-body-medium text-on-surface-variant">{t(locale, "openPlatform.developerHint")}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <div>
          <h3 className="text-label-large">{t(locale, "openPlatform.appsTitle")}</h3>
          {loading && <p className="mt-3 text-body-small text-on-surface-variant" role="status">{t(locale, "openPlatform.loading")}</p>}
          {!loading && !failed && !apps.length && <p className="mt-3 rounded-shape-md border border-dashed border-outline-variant p-4 text-body-small text-on-surface-variant">{t(locale, "openPlatform.emptyApps")}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {apps.map((app) => <button key={app.id} type="button" aria-pressed={selected?.id === app.id} onClick={() => setSelectedId(app.id)} className={`mn-list-card md3-card-outlined relative p-5 text-left ${selected?.id === app.id ? "border-primary bg-secondary-container ring-2 ring-primary/40" : "bg-surface-container-low"}`}>
              <div className="flex items-start justify-between gap-2"><span className="truncate font-black">{app.name}</span><span className="shrink-0 text-label-small text-on-surface-variant">{t(locale, `openPlatform.${app.enabled ? "ready" : "disabled"}`)}</span></div>
              <code className="mt-2 block truncate text-body-small text-on-surface-variant">{app.id}</code>
              <div className="mt-3 flex flex-wrap gap-1.5 text-label-small text-on-surface-variant"><span>{app.scopes?.length || 0} {t(locale, "openPlatform.scopesCount")}</span><span aria-hidden="true">·</span><span>{app.regions?.length || 0} {t(locale, "openPlatform.regionsCount")}</span><span aria-hidden="true">·</span><span>{app.keys?.filter((key) => !key.revokedAt).length ?? "—"}/2 {t(locale, "openPlatform.keysCount")}</span></div>
            </button>)}
          </div>
        </div>

        <form className="border-t border-outline-variant pt-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0" onSubmit={(event) => { event.preventDefault(); void run(create); }}>
          <h3 className="text-label-large">{t(locale, "openPlatform.createTitle")}</h3>
          <p className="mt-1 text-body-small text-on-surface-variant">{t(locale, "openPlatform.createHint")}</p>
          <label className="mt-4 block"><span className="mb-1 block text-label-medium">{t(locale, "openPlatform.name")}</span><input disabled={busy} className={input} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <button className={`${primary} mt-5 w-full`} disabled={busy || loading || !name.trim() || !options.scopes.length || !options.regions.length}>{t(locale, "openPlatform.create")}</button>
        </form>
      </div>
    </section>

    {selected && <section className={panel} aria-labelledby="open-platform-detail">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="open-platform-detail" className="text-title-large">{selected.name}</h2><p className="mt-1 break-all text-body-small text-on-surface-variant">{t(locale, "openPlatform.clientId")}: <code>{selected.id}</code></p></div><div className="flex flex-wrap gap-2"><button type="button" className={btn} onClick={() => void copy(selected.id)}>{t(locale, "openPlatform.copy")}</button><button type="button" className={btn} onClick={() => void copy(inviteLink(selected.id))}>{t(locale, "openPlatform.invite")}</button></div></div>
      <div className="mt-5 grid gap-5 md:grid-cols-2"><div><h3 className="text-label-medium text-on-surface-variant">{t(locale, "openPlatform.permissions")}</h3><p className="mt-2 text-body-medium text-on-surface-variant">{t(locale, "openPlatform.permissionsHint")}</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-label-medium">{t(locale, "openPlatform.regionsLabel")}</span>{selected.regions?.map((region) => <span key={region} className="inline-flex h-8 items-center rounded-shape-sm bg-secondary-container px-3 text-label-large text-on-secondary-container">{region}</span>)}</div></div><div><div className="flex items-center justify-between gap-2"><h3 className="text-label-medium text-on-surface-variant">{t(locale, "openPlatform.keysTitle")}</h3><button type="button" className={primary} disabled={busy || !selected.enabled || activeKeys.length >= 2 || selected.keyError} onClick={() => void run(() => issue(selected))}>{t(locale, "openPlatform.generate")}</button></div>{selected.keyError ? <p className="mt-3 rounded-shape-md border border-error/40 p-3 text-body-small text-error">{t(locale, "openPlatform.keysLoadError")} <button type="button" className="ml-1 font-bold underline" onClick={() => void run(load)}>{t(locale, "openPlatform.retry")}</button></p> : activeKeys.length ? <ul className="mt-3 space-y-2">{activeKeys.map((key) => <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-shape-md border border-outline-variant p-3 text-body-small"><span><code>{key.prefix}…</code><span className="ml-2 text-on-surface-variant">{t(locale, "openPlatform.secretActive")}</span></span><button type="button" className={`${btn} enabled:text-error`} disabled={busy} onClick={() => setConfirm({ kind: "revoke", app: selected, key })}>{t(locale, "openPlatform.revokeSecret")}</button></li>)}</ul> : <p className="mt-3 text-body-small text-on-surface-variant">{t(locale, "openPlatform.emptyKeys")}</p>}{activeKeys.length >= 2 && <p className="mt-2 text-body-small text-on-surface-variant">{t(locale, "openPlatform.keyLimit")}</p>}<button type="button" className={`${btn} mt-3`} disabled={busy || !canIssueKey(selected) || !activeKeys.length} onClick={() => setConfirm({ kind: "rotate", app: selected })}>{t(locale, "openPlatform.rotate")}</button></div></div>
    </section>}

    {secret && <section className={`${panel} border-primary`}><h2 className="text-label-large">{t(locale, "openPlatform.secret")}</h2><p className="mt-1 text-body-small text-on-surface-variant">{t(locale, "openPlatform.secretHint")}</p><code className="mt-3 block select-all break-all rounded-shape-md bg-surface-container-highest p-3 text-body-small">{secret}</code><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primary} onClick={() => void copy(secret)}>{t(locale, "openPlatform.copy")}</button><button type="button" className={btn} onClick={() => setSecret(null)}>{t(locale, "openPlatform.dismiss")}</button></div></section>}
    {message && <p role={failed ? "alert" : "status"} className={`text-body-small ${failed ? "text-error" : "text-on-surface-variant"}`}>{message}</p>}

    <Modal isOpen={Boolean(confirm)} onClose={() => setConfirm(null)} title={t(locale, confirm?.kind === "rotate" ? "openPlatform.confirmRotateTitle" : "openPlatform.confirmRevokeTitle")} closeLabel={t(locale, "actions.close")} size="sm">
      <p className="text-body-medium text-on-surface-variant">{t(locale, confirm?.kind === "rotate" ? "openPlatform.confirmRotate" : "openPlatform.confirmRevoke")}</p>
      <div className="mt-5 flex justify-end gap-2"><button type="button" className={btn} onClick={() => setConfirm(null)}>{t(locale, "actions.cancel")}</button><button type="button" className={`${btn} enabled:text-error`} disabled={busy} onClick={() => { const action = confirm; setConfirm(null); if (!action) return; void run(() => action.kind === "rotate" ? issue(action.app) : revokeKey(action.app, action.key!)); }}>{t(locale, "openPlatform.confirm")}</button></div>
    </Modal>
  </div>;
}

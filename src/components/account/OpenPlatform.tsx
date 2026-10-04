import { useEffect, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import { accountApi } from "@/config/account";
import { openPlatformRequest as api } from "@/lib/account/open-platform";

type Key = { id: string; prefix: string; revokedAt: number | null };
type App = { id: string; name: string; enabled: boolean; scopes: string[]; regions: string[]; keys?: Key[] };
const btn = "mn-focus mn-stamp-press inline-flex min-h-9 items-center rounded-xl border-[1.5px] border-[var(--mn-border)] px-3 text-xs font-black hover:bg-[var(--mn-cream-deep)] disabled:opacity-50";
const input = "w-full rounded-xl border border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-2 text-sm";

/**
 * The developer side of the open platform: applications and their secrets. Save consent is deliberately not
 * here; it belongs to the account page, where each user decides which archives an application may read.
 * Secrets stay in component memory only and disappear on navigation or explicit dismissal.
 */
export default function OpenPlatform({ locale, panel }: { locale: AppLocale; panel: string }) {
  const [apps, setApps] = useState<App[]>([]);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [options, setOptions] = useState({ scopes: [] as string[], regions: [] as string[] });
  const [secret, setSecret] = useState<string | null>(null);
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setFailed(false); setMessage(t(locale, "openPlatform.copied")); } catch { setFailed(true); setMessage(t(locale, "openPlatform.error")); } };
  async function load() {
    const result = await api<{ applications: App[]; scopes: string[]; regions: string[] }>(accountApi.developerApps);
    const applications = result.applications || [];
    const withKeys = await Promise.all(applications.map(async (app) => {
      try { const keys = await api<{ keys: Key[] }>(`${accountApi.developerApps}/${encodeURIComponent(app.id)}/keys`); return { ...app, keys: keys.keys || [] }; } catch { return app; }
    }));
    setApps(withKeys);
    setOptions({ scopes: result.scopes || [], regions: result.regions || [] });
    setLoaded(true);
  }
  async function run(call: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setFailed(false); setMessage("");
    try { await call(); } catch { setFailed(true); setMessage(t(locale, "openPlatform.error")); } finally { setBusy(false); }
  }
  useEffect(() => { void run(load); }, []);
  async function create() {
    setSecret(null);
    const result = await api<{ application: App }>(accountApi.developerApps, "POST", { name: name.trim(), scopes: options.scopes, regions: options.regions });
    setName("");
    // Keep the created application visible if issuing its first key fails.
    setApps((current) => [...current, result.application]);
    await issue(result.application);
  }
  async function revokeKey(app: App, key: Key) {
    await api(`${accountApi.developerApps}/${encodeURIComponent(app.id)}/keys/${encodeURIComponent(key.id)}`, "DELETE");
  }
  async function issue(app: App, rotate = false) {
    if ((app.keys || []).filter((key) => !key.revokedAt).length >= 2) { setMessage(t(locale, "openPlatform.keyLimit")); return; }
    if (rotate && !window.confirm(t(locale, "openPlatform.confirmRotate"))) return;
    setSecret(null);
    const result = await api<{ secret: string }>(`${accountApi.developerApps}/${encodeURIComponent(app.id)}/keys`, "POST");
    // Show the new credential immediately; existing keys remain active until explicit revocation.
    setSecret(result.secret);
    // Rotation deliberately leaves the old key active so the developer can deploy the new secret first.
    await load();
  }
  const inviteLink = (id: string) => `${window.location.origin}${localizePath(getRoutePathById("account"), locale)}?invite=${encodeURIComponent(id)}`;
  const docsPath = localizePath(getRoutePathById("open-platform-docs"), locale);
  return <div className="space-y-5" aria-busy={busy}>
    <section className={panel}>
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-black">{t(locale, "openPlatform.developer")}</h2><button type="button" className={btn} disabled={busy} onClick={() => void run(load)}>{t(locale, "openPlatform.refresh")}</button></div>
      <p className="mt-1 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.developerHint")}</p>
      <p className="mt-1 text-xs"><a className="mn-focus font-bold underline" href={docsPath}>{t(locale, "openPlatform.docs.title")}</a></p>
      <form onSubmit={(event) => { event.preventDefault(); void run(create); }} className="mt-4 flex flex-wrap gap-2">
        <label className="min-w-0 flex-1"><span className="mb-1 block text-xs">{t(locale, "openPlatform.name")}</span><input className={input} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <button className={`${btn} self-end`} disabled={busy || !options.scopes.length}>{t(locale, "openPlatform.create")}</button>
      </form>
      <div className="mt-4 space-y-3">{loaded && !apps.length && <p className="text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.emptyApps")}</p>}{apps.map((app) => <div key={app.id} className="rounded-xl border border-[var(--mn-border)] p-3">
        <div className="flex flex-wrap items-center gap-2"><b>{app.name}</b><span className="text-xs text-[var(--mn-text-muted)]">{t(locale, `openPlatform.${!app.enabled ? "disabled" : "ready"}`)}</span></div>
        <p className="mt-1 break-all text-xs">{t(locale, "openPlatform.clientId")}: <code>{app.id}</code></p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => void copy(app.id)}>{t(locale, "openPlatform.copy")}</button>
          <button type="button" className={btn} onClick={() => void copy(inviteLink(app.id))}>{t(locale, "openPlatform.invite")}</button>
          <button type="button" className={btn} disabled={busy || !app.enabled} onClick={() => void run(() => issue(app))}>{t(locale, "openPlatform.generate")}</button>
          <button type="button" className={btn} disabled={busy || !app.enabled || !app.keys?.some((key) => !key.revokedAt)} onClick={() => void run(() => issue(app, true))}>{t(locale, "openPlatform.rotate")}</button>
        </div>
        {(app.keys || []).filter((key) => !key.revokedAt).length >= 2 && <p className="mt-2 text-xs text-[var(--mn-text-muted)]">{t(locale, "openPlatform.keyLimit")}</p>}
        <ul className="mt-2 space-y-1">{(app.keys || []).filter((key) => !key.revokedAt).map((key) => <li key={key.id} className="flex flex-wrap items-center gap-2 text-xs"><code>{key.prefix}…</code><span>{t(locale, "openPlatform.secretActive")}</span><button type="button" className={btn} disabled={busy} onClick={() => { if (window.confirm(t(locale, "openPlatform.confirmRevoke"))) void run(async () => { setSecret(null); await revokeKey(app, key); await load(); }); }}>{t(locale, "openPlatform.revokeSecret")}</button></li>)}</ul>
      </div>)}</div>
    </section>
    {secret && <section className={`${panel} border-[var(--mn-accent)]`}><h2 className="text-sm font-black">{t(locale, "openPlatform.secret")}</h2><p className="mt-1 text-xs">{t(locale, "openPlatform.secretHint")}</p><code className="mt-2 block break-all text-xs">{secret}</code><div className="mt-3 flex gap-2"><button type="button" className={btn} onClick={() => void copy(secret)}>{t(locale, "openPlatform.copy")}</button><button type="button" className={btn} onClick={() => setSecret(null)}>{t(locale, "openPlatform.dismiss")}</button></div></section>}
    {message && <p role={failed ? "alert" : "status"} className={`text-xs ${failed ? "text-[var(--mn-danger,#ba1b1b)]" : "text-[var(--mn-text-muted)]"}`}>{message}</p>}
  </div>;
}

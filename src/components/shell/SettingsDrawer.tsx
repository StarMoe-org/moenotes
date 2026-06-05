import React from "react";
import type { AppLocale } from "@/config/locales";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/config/locales";
import { switchLocalePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useSettings } from "@/lib/settings/use-settings";
import type { AppSettings } from "@/types/settings";

interface SettingsDrawerProps {
  locale: AppLocale;
  pathname: string;
}

export default function SettingsDrawer({ locale, pathname }: SettingsDrawerProps) {
  const { isOpen, close } = useOverlay("settings");
  const { settings, updateSettings } = useSettings();

  const update = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-sm" onClick={close}>
      <aside className="mn-glass h-full w-full max-w-md overflow-y-auto rounded-l-[2rem] p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--mn-text)]">{t(locale, "settings.title")}</h2>
          <button className="mn-focus rounded-full px-3 py-1 text-sm text-[var(--mn-text-muted)] hover:bg-white/30" onClick={close}>{t(locale, "actions.close")}</button>
        </div>
        <div className="space-y-5">
          <Section title={t(locale, "settings.language")}>
            <div className="grid grid-cols-1 gap-2">
              {SUPPORTED_LOCALES.map((item) => (
                <a key={item} href={switchLocalePath(pathname, item)} className={`rounded-2xl border px-4 py-3 text-sm ${item === locale ? "border-[var(--mn-accent)] bg-[var(--mn-accent)] text-white" : "border-[var(--mn-border)] text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}>{LOCALE_LABELS[item]}</a>
              ))}
            </div>
          </Section>
          <Section title={t(locale, "settings.colorScheme")}>
            <Segmented value={settings.colorScheme} options={["system", "light", "dark"]} label={(v) => t(locale, `settings.options.${v}`)} onChange={(value) => update({ colorScheme: value as AppSettings["colorScheme"] })} />
          </Section>
          <Section title={t(locale, "settings.animationLevel")}>
            <Segmented value={settings.animationLevel} options={["full", "reduced", "off"]} label={(v) => t(locale, `settings.options.${v}`)} onChange={(value) => update({ animationLevel: value as AppSettings["animationLevel"] })} />
          </Section>
          <Section title={t(locale, "settings.sidebarMode")}>
            <Segmented value={settings.sidebarMode} options={["auto", "expanded", "collapsed"]} label={(v) => t(locale, `settings.options.${v}`)} onChange={(value) => update({ sidebarMode: value as AppSettings["sidebarMode"] })} />
          </Section>
          <label className="flex items-center justify-between rounded-2xl border border-[var(--mn-border)] p-4 text-sm text-[var(--mn-text)]">
            {t(locale, "settings.scrollMemory")}
            <input type="checkbox" checked={settings.enableScrollMemory} onChange={(event) => update({ enableScrollMemory: event.currentTarget.checked })} />
          </label>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--mn-text-muted)]">{title}</h3>{children}</section>;
}

function Segmented({ value, options, label, onChange }: { value: string; options: string[]; label: (value: string) => string; onChange: (value: string) => void }) {
  return <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--mn-border)] p-1">{options.map((option) => <button key={option} className={`rounded-xl px-3 py-2 text-sm ${value === option ? "bg-[var(--mn-accent)] text-white" : "text-[var(--mn-text-muted)] hover:bg-white/30"}`} onClick={() => onChange(option)}>{label(option)}</button>)}</div>;
}

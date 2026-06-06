import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/config/locales";
import { switchLocalePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useSettings } from "@/lib/settings/use-settings";
import Modal from "@/components/shared/Modal";
import type { AppSettings } from "@/types/settings";

interface SettingsDrawerProps {
  locale: AppLocale;
  pathname: string;
}

const chevronDown = (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);


export default function SettingsDrawer({ locale, pathname }: SettingsDrawerProps) {
  const { isOpen, close } = useOverlay("settings");
  const { settings, updateSettings } = useSettings();
  const [langOpen, setLangOpen] = useState(false);

  const update = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={t(locale, "settings.title")} size="md">
      <div className="space-y-6">
        {/* Language (Dropdown) */}
        <Section title={t(locale, "settings.language")}>
          <div className="relative">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-4 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:shadow-[var(--mn-shadow-stamp)] hover:translate-x-[1px] hover:translate-y-[1px]"
              onClick={() => setLangOpen(!langOpen)}
            >
              {LOCALE_LABELS[locale]}
              {chevronDown}
            </button>
            {langOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] py-1 shadow-[var(--mn-shadow-stamp)]">
                  {SUPPORTED_LOCALES.map((item) => (
                    <a
                      key={item}
                      href={switchLocalePath(pathname, item)}
                      className={`block px-4 py-2.5 text-sm font-bold transition hover:bg-[var(--mn-cream-deep)] ${item === locale ? "bg-[var(--mn-accent)] text-[var(--mn-bg)]" : "text-[var(--mn-text)]"}`}
                      onClick={() => setLangOpen(false)}
                    >
                      {LOCALE_LABELS[item]}
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </Section>

        {/* Color Scheme */}
        <Section title={t(locale, "settings.colorScheme")}>
          <Segmented
            value={settings.colorScheme}
            options={["system", "light", "dark"]}
            label={(v) => t(locale, `settings.options.${v}`)}
            onChange={(value) => update({ colorScheme: value as AppSettings["colorScheme"] })}
          />
        </Section>

        {/* Sidebar Mode */}
        <Section title={t(locale, "settings.sidebarMode")}>
          <Segmented
            value={settings.sidebarMode}
            options={["auto", "expanded", "collapsed"]}
            label={(v) => t(locale, `settings.options.${v}`)}
            onChange={(value) => update({ sidebarMode: value as AppSettings["sidebarMode"] })}
          />
        </Section>

      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-[var(--mn-font-display)] text-xs uppercase tracking-[0.18em] text-[var(--mn-accent)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Segmented({
  value,
  options,
  label,
  onChange,
}: {
  value: string;
  options: string[];
  label: (value: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border-2 border-[var(--mn-border)] bg-[var(--mn-surface-strong)] p-1 shadow-[var(--mn-shadow-stamp-sm)]">
      {options.map((option) => (
        <button
          key={option}
          className={`rounded-md px-3 py-2 text-sm font-black transition ${
            value === option
              ? "bg-[var(--mn-accent)] text-[var(--mn-bg)]"
              : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"
          }`}
          onClick={() => onChange(option)}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}

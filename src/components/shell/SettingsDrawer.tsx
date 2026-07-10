import { type CSSProperties, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/config/locales";
import { switchLocalePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useSettings } from "@/lib/settings/use-settings";
import Modal from "@/components/shared/Modal";
import Popover from "@/components/shared/Popover";
import type { AppSettings } from "@/types/settings";

interface SettingsDrawerProps {
  locale: AppLocale;
  pathname: string;
}

const chevronDown = (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

export default function SettingsDrawer({ locale, pathname }: SettingsDrawerProps) {
  const { isOpen, close } = useOverlay("settings");
  const { settings, updateSettings } = useSettings();

  const update = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={t(locale, "settings.title")} closeLabel={t(locale, "actions.close")} size="md">
      <div className="space-y-6">
        <Section title={t(locale, "settings.language")}>
          <Popover
            matchTriggerWidth
            trigger={({ ref, onClick, ...aria }) => (
              <button
                ref={ref as React.Ref<HTMLButtonElement>}
                type="button"
                className="mn-stamp-press flex w-full items-center justify-between rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-5 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
                onClick={onClick}
                {...aria}
              >
                {LOCALE_LABELS[locale]}
                {chevronDown}
              </button>
            )}
          >
            {({ close: closePopover }) => (
              <>
                {SUPPORTED_LOCALES.map((item) => (
                  <a
                    key={item}
                    href={switchLocalePath(pathname, item)}
                    className={`block rounded-full px-4 py-2 text-sm font-bold transition hover:bg-[var(--mn-cream-deep)] ${item === locale ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}
                    onClick={closePopover}
                  >
                    {LOCALE_LABELS[item]}
                  </a>
                ))}
              </>
            )}
          </Popover>
        </Section>

        <Section title={t(locale, "settings.colorScheme")}>
          <Segmented
            value={settings.colorScheme}
            options={["system", "light", "dark"]}
            label={(value) => t(locale, `settings.options.${value}`)}
            onChange={(value) => update({ colorScheme: value as AppSettings["colorScheme"] })}
          />
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-[var(--mn-font-display)] text-xs uppercase tracking-[0.18em] text-[var(--mn-accent-deep)]">
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
    <div className="grid grid-cols-[repeat(var(--mn-segment-count),minmax(0,1fr))] gap-2 rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-surface-strong)] p-1 shadow-[var(--mn-shadow-stamp-sm)]" style={{ "--mn-segment-count": options.length } as CSSProperties}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-black transition ${
            value === option
              ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
              : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"
          }`}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}

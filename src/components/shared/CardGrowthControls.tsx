import { useId, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

export function LevelControl({
  locale,
  level,
  limit,
  onChange,
}: {
  locale: AppLocale;
  level: number;
  limit: number;
  onChange: (level: number) => void;
}) {
  const labelId = useId();
  const progress = limit > 1 ? ((level - 1) / (limit - 1)) * 100 : 100;
  const update = (next: number) => onChange(Math.min(Math.max(next, 1), limit));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span id={labelId} className="text-[var(--mn-text-muted)]">{t(locale, "cards.growth.level")}</span>
        <span className="font-mono text-[var(--mn-text)]">{t(locale, "cards.growth.levelValue", { level, limit })}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <RoundButton label={t(locale, "cards.growth.decrease")} disabled={level <= 1} onClick={() => update(level - 1)}>
          <path strokeLinecap="round" d="M5 12h14" />
        </RoundButton>
        <input
          type="range"
          min={1}
          max={limit}
          value={level}
          onChange={(event) => update(Number(event.target.value))}
          aria-labelledby={labelId}
          className="mn-focus h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-lg accent-[var(--mn-accent)]"
          style={{
            background: `linear-gradient(to right, var(--mn-accent) 0%, var(--mn-accent) ${progress}%, var(--mn-cream-deep) ${progress}%, var(--mn-cream-deep) 100%)`,
          }}
        />
        <RoundButton label={t(locale, "cards.growth.increase")} disabled={level >= limit} onClick={() => update(level + 1)}>
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </RoundButton>
        <button
          type="button"
          disabled={level >= limit}
          onClick={() => update(limit)}
          className="mn-focus shrink-0 rounded-xl border border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-1 text-xs font-bold text-[var(--mn-accent-deep)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:bg-[var(--mn-accent-soft)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-[var(--mn-paper)]"
        >
          {t(locale, "cards.growth.max")}
        </button>
      </div>
    </div>
  );
}

export function StepControl({
  label,
  value,
  options,
  formatOption = String,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  formatOption?: (option: number, index: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-sm font-semibold text-[var(--mn-text-muted)]">{label}</span>
      <div role="group" aria-label={label} className="flex gap-1 rounded-xl border border-[var(--mn-border)] bg-[var(--mn-surface-strong)] p-1 shadow-[var(--mn-shadow-stamp-sm)]">
        {options.map((option, index) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={`mn-focus min-w-9 rounded-xl px-2.5 py-1 font-mono text-xs font-bold transition ${
              value === option
                ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
                : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"
            }`}
          >
            {formatOption(option, index)}
          </button>
        ))}
      </div>
    </div>
  );
}

function RoundButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="mn-focus grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:cursor-default disabled:opacity-40"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

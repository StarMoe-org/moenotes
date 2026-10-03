import { useId } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import LevelSwitch, { RoundButton } from "@/components/shared/LevelSwitch";

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

/** Segmented step picker (training, awaken, skill level): the shared LevelSwitch. */
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
  return <LevelSwitch label={label} value={value} options={options} formatOption={formatOption} onChange={onChange} />;
}

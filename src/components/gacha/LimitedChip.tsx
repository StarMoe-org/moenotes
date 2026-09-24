import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

export default function LimitedChip({ locale }: { locale: AppLocale }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--mn-amber)_80%,transparent)] bg-[var(--mn-paper)] px-2.5 py-1 text-[11px] font-bold leading-none text-[var(--mn-ink-soft)]">
      {t(locale, "gacha.limited")}
    </span>
  );
}

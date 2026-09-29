import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { NewsCategory } from "@/lib/game-api/announcements";

const toneByCategory: Record<NewsCategory, string> = {
  maintenance: "border-[color-mix(in_srgb,var(--mn-accent)_45%,transparent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]",
  bug: "border-[color-mix(in_srgb,var(--mn-rose)_55%,transparent)] bg-[color-mix(in_srgb,var(--mn-rose)_14%,transparent)] text-[var(--mn-rose)]",
  campaign: "border-[color-mix(in_srgb,var(--mn-pink)_70%,transparent)] bg-[var(--mn-pink-soft)] text-[var(--mn-ink-soft)]",
  update: "border-[color-mix(in_srgb,var(--mn-mint)_80%,transparent)] bg-[var(--mn-mint-soft)] text-[var(--mn-mint-deep)]",
  gacha: "border-[color-mix(in_srgb,var(--mn-amber)_60%,transparent)] bg-[color-mix(in_srgb,var(--mn-amber)_16%,transparent)] text-[var(--mn-text)]",
  other: "border-[var(--mn-glass-border)] bg-[var(--mn-cream-deep)] text-[var(--mn-text-muted)]",
};

export default function NewsCategoryBadge({ locale, category }: { locale: AppLocale; category: NewsCategory }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black leading-4 ${toneByCategory[category]}`}>
      {t(locale, `news.category.${category}`)}
    </span>
  );
}

"use client";

import Button from "@mui/material/Button";
import { Icon } from "@/components/shared/icons";
import { t } from "@/i18n";
import type { AppLocale } from "@/config/locales";

interface SpoilerNoticeProps {
  locale: AppLocale;
  onBack?: () => void;
}

export function SpoilerNotice({ locale, onBack }: SpoilerNoticeProps) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return (
    <div className="md3-surface mx-auto my-12 max-w-xl rounded-shape-xl p-8 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-surface-container-highest text-on-surface-variant">
        <Icon name="lock" className="h-8 w-8" />
      </div>
      <h2 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">
        {t(locale, "settings.spoiler.restrictedTitle")}
      </h2>
      <p className="mt-3 text-body-medium leading-relaxed text-on-surface-variant">
        {t(locale, "settings.spoiler.eulaNotice")}
      </p>
      <div className="mt-6 flex justify-center">
        <Button variant="tonal" onClick={handleBack}>
          {t(locale, "actions.back")}
        </Button>
      </div>
    </div>
  );
}

export function DeveloperTestingBanner({ locale }: { locale: AppLocale }) {
  return (
    <div className="mb-6 flex items-center gap-2.5 rounded-shape-md border border-outline-variant bg-surface-container-high px-4 py-3 text-body-medium text-on-surface-variant">
      <Icon name="info" className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-on-surface">{t(locale, "settings.spoiler.devTestingBadge")}: </span>
        <span>{t(locale, "settings.spoiler.devOnly")}</span>
      </div>
    </div>
  );
}

export default SpoilerNotice;

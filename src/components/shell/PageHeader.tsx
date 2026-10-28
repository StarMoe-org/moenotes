import type { ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { splitTitleHighlight, titleHighlightId } from "@/lib/format/title-highlight";

interface PageHeaderProps {
  locale: AppLocale;
  titleKey: string;
  descriptionKey: string;
  showDescription?: boolean;
  /** The page renders its own heading (and h1), e.g. a detail page titled with the entity's name. */
  hideHeader?: boolean;
  titleBadge?: ReactNode;
  children?: ReactNode;
}

export default function PageHeader({
  locale,
  titleKey,
  descriptionKey,
  showDescription = true,
  hideHeader = false,
  titleBadge,
  children,
}: PageHeaderProps) {
  const title = splitTitleHighlight(t(locale, titleKey), t(locale, `pageTitleHighlights.${titleHighlightId(titleKey)}`));
  return (
    <>
      {!hideHeader && (
        <header className="md3-page-heading">
          <div className="flex flex-wrap items-center gap-3">
            <h1>
              {title.before}
              <span className="mn-brand-mark">{title.mark}</span>
              {title.after}
            </h1>
            {titleBadge}
          </div>
          {showDescription ? <p>{t(locale, descriptionKey)}</p> : null}
        </header>
      )}
      {children}
    </>
  );
}

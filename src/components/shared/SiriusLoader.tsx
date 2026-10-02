import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import "@/styles/sirius-loader.css";

/** Decorative when paired with a button label or a loading status. */
export function SiriusIcon({ className = "h-4 w-4", spacious = false }: { className?: string; spacious?: boolean }) {
  return (
    <svg className={`mn-sirius-graphic ${className}`} viewBox={spacious ? "0 0 160 160" : "24 24 112 112"} fill="none" aria-hidden="true">
      <g className="mn-sirius-spin">
        {[0, 90, 180, 270].map((angle, index) => (
          <g key={angle} transform={`rotate(${angle} 80 80)`}>
            <path className="mn-sirius-piece" style={{ animationDelay: `${index * -.224}s` }} d="M80 39 94 65 80 77 66 65Z" fill="currentColor" />
          </g>
        ))}
      </g>
      <circle className="mn-sirius-center" cx="80" cy="80" r="2.2" fill="currentColor" />
    </svg>
  );
}

export default function SiriusLoader({ locale, label, compact = false, className = "" }: {
  locale: AppLocale;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`mn-sirius-loader ${compact ? "mn-sirius-compact" : "mn-sirius-full"} ${className}`} role="status" aria-label={label ?? t(locale, "loader.loading")}>
      <SiriusIcon spacious={!compact} className={compact ? "h-6 w-6" : "mn-sirius-large"} />
      {compact ? (
        <span className="mn-sirius-message" aria-hidden="true">{(label ?? t(locale, "loader.loading")).replace(/(?:\.{3}|…)+$/, "")}<span className="mn-sirius-dots"><i>.</i><i>.</i><i>.</i></span></span>
      ) : label ? <span className="mn-sirius-detail" aria-hidden="true">{label}</span> : null}
    </span>
  );
}

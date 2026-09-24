import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { formatCompactCount } from "@/lib/format/compact-count";
import type { RewardViewModel } from "@/lib/rewards/resources";
import { getRoutePathById } from "@/lib/route/registry";

interface Props {
  reward: RewardViewModel;
  locale: AppLocale;
  /** "row" shows the name; "icon" is a compact tile with the count badge only. */
  variant?: "row" | "icon";
  /** Set false inside another link, where a nested anchor would be invalid. */
  linked?: boolean;
}

export function rewardName(reward: RewardViewModel, locale: AppLocale): string {
  return reward.name || t(locale, "rewards.unknownReward", { kind: t(locale, `rewards.resourceKinds.${reward.kind}`), id: reward.id });
}

function rewardHref(reward: RewardViewModel, locale: AppLocale): string | null {
  if (!reward.link) return null;
  const base = getRoutePathById(reward.link.routeId);
  return localizePath(reward.link.detailId === undefined ? base : `${base}/${reward.link.detailId}`, locale);
}

// Card and jacket art is cropped to fill; item icons and stickers keep their transparent silhouette.
const coverKinds = new Set(["member", "support", "music", "spot"]);

function RewardIcon({ reward, size }: { reward: RewardViewModel; size: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--mn-glass-border)] bg-[var(--mn-surface)] ${size}`}>
      {reward.imageUrl && !failed ? (
        <img className={`h-full w-full ${coverKinds.has(reward.kind) ? "object-cover" : "object-contain p-0.5"}`} src={reward.imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="text-[10px] font-bold text-[var(--mn-text-muted)]">#{reward.id}</span>
      )}
    </span>
  );
}

export default function RewardChip({ reward, locale, variant = "row", linked = true }: Props) {
  const name = rewardName(reward, locale);
  const count = reward.count > 1 ? t(locale, "rewards.count", { count: formatCompactCount(reward.count) }) : "";
  const exactCount = reward.count > 1 ? t(locale, "rewards.count", { count: reward.count.toLocaleString(locale) }) : "";
  const label = `${name} ${exactCount}`.trim();
  const href = linked ? rewardHref(reward, locale) : null;
  const className = "mn-focus group inline-flex min-w-0 items-center gap-2 rounded-xl text-left";

  if (variant === "icon") {
    const content = (
      <>
        <RewardIcon reward={reward} size="h-11 w-11" />
        {count && <span className="absolute -bottom-1 -right-1 rounded-full border border-[var(--mn-paper)] bg-[var(--mn-accent-deep)] px-1.5 py-px font-mono text-[10px] font-bold leading-4 text-[var(--mn-paper)]">{count}</span>}
      </>
    );
    return href
      ? <a href={href} className={`${className} relative`} title={label} aria-label={label}>{content}</a>
      : <span className={`${className} relative`} title={label} aria-label={label}>{content}</span>;
  }

  const content = (
    <>
      <RewardIcon reward={reward} size="h-10 w-10" />
      <span className="min-w-0">
        <span className={`block truncate text-sm font-bold text-[var(--mn-text)] ${href ? "group-hover:text-[var(--mn-accent-deep)]" : ""}`}>{name}</span>
        <span className="block text-[11px] font-medium text-[var(--mn-text-muted)]">
          {t(locale, `rewards.resourceKinds.${reward.kind}`)}{count && <span className="ml-1.5 font-mono font-bold text-[var(--mn-accent-deep)]" title={exactCount}>{count}</span>}
        </span>
      </span>
    </>
  );
  return href ? <a href={href} className={className}>{content}</a> : <span className={className}>{content}</span>;
}

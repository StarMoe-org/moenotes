import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import UpgradeCostTable, { type UpgradeStep } from "@/components/shared/UpgradeCostTable";
import { entityLinkPath } from "@/lib/route/entity-link";
import { localizePath } from "@/i18n/routing";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import type { CardMaterialCost, CardMaterialGroup, CardMaterialKind } from "@/lib/cards/materials";

interface Props {
  locale: AppLocale;
  groups: CardMaterialGroup[];
}

/** i18n key of each material kind's tab and of its step label (`{level}` / `{rank}`). */
const LABEL_KEY: Record<CardMaterialKind, string> = {
  training: "cards.materials.kinds.training",
  awaken: "cards.materials.kinds.awaken",
  liveSkill: "cards.materials.kinds.liveSkill",
  gekisouSkill: "cards.materials.kinds.gekisouSkill",
  limitBreak: "supportCards.materials.limitBreak",
};

/** A card's upgrade materials: one tab per kind (training, awakening, skills…), each a step-by-step cost table. */
export default function CardMaterialsPanel({ locale, groups }: Props) {
  const assetUrl = useAssetUrl();
  const [active, setActive] = useState<CardMaterialKind | null>(null);
  const current = groups.find((group) => group.kind === active) ?? groups[0];
  const steps = useMemo<UpgradeStep[]>(() => (current?.steps ?? []).map((step) => ({
    from: step.from,
    to: step.to,
    costs: step.costs.map((cost) => toUpgradeCost(cost, assetUrl)),
  })), [current, assetUrl]);

  return (
    <div className="mn-paper overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
        <h3 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">{t(locale, "cards.materials.title")}</h3>
        {groups.length > 1 && (
          <div className="mn-segmented flex max-w-full flex-wrap gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={t(locale, "cards.materials.title")}>
            {groups.map((group) => (
              <button
                key={group.kind}
                type="button"
                aria-pressed={group === current}
                onClick={() => setActive(group.kind)}
                className={`mn-focus rounded-full px-3 py-1 text-xs font-bold transition ${group === current ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
              >
                {t(locale, LABEL_KEY[group.kind])}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-3 p-6 sm:p-8">
        {!current ? (
          <p className="text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "cards.materials.empty")}</p>
        ) : (
          <>
            {current.alternative && (
              <p className="text-xs font-medium text-[var(--mn-text-muted)]">
                {t(locale, "cards.materials.alternative")}{" "}
                {current.alternative.link
                  ? <a className="mn-focus font-bold text-[var(--mn-accent-deep)] underline decoration-dotted underline-offset-4" href={localizePath(entityLinkPath(current.alternative.link), locale)}>{current.alternative.name}</a>
                  : <span className="font-bold text-[var(--mn-text)]">{current.alternative.name}</span>}
              </p>
            )}
            <UpgradeCostTable
              locale={locale}
              steps={steps}
              cumulative
              stepHeader={t(locale, current.kind === "limitBreak" ? "supportCards.materials.limitBreak" : current.kind === "liveSkill" || current.kind === "gekisouSkill" ? "cards.growth.skillLevel" : `cards.materials.kinds.${current.kind}`)}
              costHeader={t(locale, "cards.materials.cost")}
              emptyText={t(locale, "cards.materials.empty")}
              formatStep={(step) => `${step.from} → ${step.to}`}
            />
          </>
        )}
      </div>
    </div>
  );
}

function toUpgradeCost(cost: CardMaterialCost, assetUrl: (url: string) => string) {
  return {
    id: cost.id,
    name: cost.name,
    imageUrl: assetUrl(cost.imageUrl),
    count: cost.count,
    ...(cost.link ? { href: entityLinkPath(cost.link) } : {}),
  };
}

"use client";

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
    <div className="md3-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-4 sm:px-8">
        <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">{t(locale, "cards.materials.title")}</h3>
        {groups.length > 1 && (
          <div className="md3-segmented" role="group" aria-label={t(locale, "cards.materials.title")}>
            {groups.map((group) => (
              <button
                key={group.kind}
                type="button"
                aria-pressed={group === current}
                onClick={() => setActive(group.kind)}
                className="md3-segment md3-state"
              >
                {t(locale, LABEL_KEY[group.kind])}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-3 p-6 sm:p-8">
        {!current ? (
          <p className="text-body-medium text-on-surface-variant">{t(locale, "cards.materials.empty")}</p>
        ) : (
          <>
            {current.alternative && (
              <p className="text-body-small text-on-surface-variant">
                {t(locale, "cards.materials.alternative")}{" "}
                {current.alternative.link
                  ? <a className="font-bold text-primary underline decoration-dotted underline-offset-4" href={localizePath(entityLinkPath(current.alternative.link), locale)}>{current.alternative.name}</a>
                  : <span className="font-bold text-on-surface">{current.alternative.name}</span>}
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

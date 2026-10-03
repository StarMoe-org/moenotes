import { useMemo } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import UpgradeCostTable, { type UpgradeStep } from "@/components/shared/UpgradeCostTable";
import type { BandItemUpgradeStep } from "@/lib/band-items/data";
import { getItemIconUrl } from "@/lib/items/assets";
import { useAssetUrl } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  steps: BandItemUpgradeStep[];
  /** Highest level the item can reach; rows past it are not shown. */
  maxLevel: number;
}

/** Per-level upgrade materials: one row per level, every material that level costs (the shared UpgradeCostTable). */
export default function BandItemUpgradeTable({ locale, steps, maxLevel }: Props) {
  const assetUrl = useAssetUrl();
  const rows = useMemo<UpgradeStep[]>(() => steps
    .filter((step) => step.level <= maxLevel)
    .map((step) => ({
      from: step.level - 1,
      to: step.level,
      costs: step.costs.map((cost) => ({
        id: cost.itemId,
        name: cost.itemName,
        imageUrl: assetUrl(getItemIconUrl(cost.itemImagePath, locale)),
        count: cost.count,
      })),
    })), [steps, maxLevel, assetUrl, locale]);
  return (
    <UpgradeCostTable
      locale={locale}
      steps={rows}
      stepHeader={t(locale, "bandItems.upgradeLevel")}
      costHeader={t(locale, "bandItems.upgradeCost")}
      emptyText={t(locale, "bandItems.upgradeEmpty")}
      formatStep={(step) => t(locale, "bandItems.level", { level: step.to })}
    />
  );
}

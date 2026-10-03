import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { BandItemUpgradeStep } from "@/lib/band-items/data";
import { getItemIconUrl } from "@/lib/items/assets";
import { useAssetUrl } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  steps: BandItemUpgradeStep[];
  /** Highest level the item can reach; rows past it are not shown. */
  maxLevel: number;
}

/** Per-level upgrade materials: one row per level, every material that level costs. */
export default function BandItemUpgradeTable({ locale, steps, maxLevel }: Props) {
  const assetUrl = useAssetUrl();
  const visible = steps.filter((step) => step.level <= maxLevel && step.costs.length > 0);
  if (visible.length === 0) {
    return <p className="text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "bandItems.upgradeEmpty")}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-bold uppercase tracking-wide text-[var(--mn-text-muted)]/80">
          <th scope="col" className="py-2 pr-3">{t(locale, "bandItems.upgradeLevel")}</th>
          <th scope="col" className="py-2">{t(locale, "bandItems.upgradeCost")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--mn-border)]/40">
        {visible.map((step) => (
          <tr key={step.level}>
            <th scope="row" className="py-2 pr-3 align-top whitespace-nowrap font-bold text-[var(--mn-text)]">
              {t(locale, "bandItems.level", { level: step.level })}
            </th>
            <td className="py-2">
              <ul className="flex flex-wrap gap-2">
                {step.costs.map((cost) => {
                  const iconUrl = assetUrl(getItemIconUrl(cost.itemImagePath, locale));
                  return (
                    <li
                      key={cost.itemId}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--mn-border)]/60 bg-[var(--mn-cream-deep)]/40 px-2 py-1"
                      title={cost.itemName}
                    >
                      {iconUrl ? <img src={iconUrl} alt="" loading="lazy" className="h-6 w-6 object-contain" /> : null}
                      <span className="font-medium text-[var(--mn-text)]">{cost.itemName}</span>
                      <span className="font-black tabular-nums text-[var(--mn-text)]">×{cost.count.toLocaleString(locale)}</span>
                    </li>
                  );
                })}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

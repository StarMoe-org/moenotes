import { useEffect, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import Modal from "@/components/shared/Modal";
import { t } from "@/i18n";
import { getBandItemIconUrl } from "@/lib/band-items/assets";
import { resolveBandItemUpgradeSteps, type BandItemUpgradeStep, type BandItemViewModel } from "@/lib/band-items/data";
import { loadBandItemUpgrades } from "@/lib/band-items/upgrades-client";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import BandItemUpgradeTable from "./BandItemUpgradeTable";

interface Props {
  locale: AppLocale;
  /** The server whose cost table to show (the list's current server scope). */
  server: GameServer;
  item: BandItemViewModel | null;
  onClose: () => void;
}

type UpgradeState = { status: "loading" } | { status: "ready"; steps: BandItemUpgradeStep[] };

/**
 * One band item's detail: its artwork and the per-level upgrade materials, fetched from `/band-item-upgrades.json`
 * on first open. Built on the shared Modal (focus trap, scroll lock, Escape, and a history entry Back closes).
 */
export default function BandItemOverlay({ locale, server, item, onClose }: Props) {
  const assetUrl = useAssetUrl();
  const [upgrades, setUpgrades] = useState<UpgradeState>({ status: "loading" });
  const [artFailed, setArtFailed] = useState(false);

  const resourceGroupId = item?.resourceGroupId;
  useEffect(() => {
    if (resourceGroupId === undefined) return;
    let cancelled = false;
    setUpgrades({ status: "loading" });
    void loadBandItemUpgrades().then((payload) => {
      if (cancelled) return;
      setUpgrades({ status: "ready", steps: payload ? resolveBandItemUpgradeSteps(payload, server, resourceGroupId, locale) : [] });
    });
    return () => { cancelled = true; };
  }, [resourceGroupId, server, locale]);

  const itemId = item?.id;
  useEffect(() => setArtFailed(false), [itemId]);

  const artUrl = item ? assetUrl(getBandItemIconUrl(item, locale)) : "";

  return (
    <Modal isOpen={item !== null} onClose={onClose} title={item?.name} closeLabel={t(locale, "bandItems.overlayClose")} size="lg">
      {item ? (
        <div className="grid gap-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <div className="flex justify-center sm:block">
            {artUrl && !artFailed ? (
              <img
                src={artUrl}
                alt={item.name}
                width={270}
                height={516}
                className="h-auto w-28 sm:w-full rounded-xl border border-[var(--mn-border)]/40 bg-[var(--mn-cream-deep)] object-contain"
                onError={() => setArtFailed(true)}
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--mn-text-muted)]/80">{item.bandName}</p>
            <p className="mt-1 text-[11px] font-semibold text-[var(--mn-text-muted)]/70">
              {t(locale, "bandItems.maxLevel", { level: item.maxLevel })}
            </p>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-widest text-[var(--mn-text-muted)]">
              {t(locale, "bandItems.upgradeTitle")}
            </h3>
            <div className="mt-3" aria-busy={upgrades.status === "loading"}>
              {upgrades.status === "loading" ? (
                <p className="text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "bandItems.upgradeLoading")}</p>
              ) : (
                <BandItemUpgradeTable locale={locale} steps={upgrades.steps} maxLevel={item.maxLevel} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Link from "@mui/material/Link";
import ToggleButton from "@mui/material/ToggleButton";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
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

const tabSx: SxProps<Theme> = {
  borderRadius: 2,
  textTransform: "none",
  fontSize: 12,
  fontWeight: 700,
  px: 1.5,
  py: 0.5,
  border: "1px solid var(--md-sys-color-outline-variant)",
  color: "var(--md-sys-color-on-surface)",
  "&.Mui-selected": {
    bgcolor: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
  },
  "&.Mui-selected:hover": {
    bgcolor: "var(--md-sys-color-secondary-container)",
  },
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
    <MdMuiProvider>
      <Card variant="outlined" sx={{ overflow: "hidden" }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5, borderBottom: "1px solid var(--md-sys-color-outline-variant)", px: 3, py: 2 }}>
          <Typography sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 20, sm: 24 }, color: "var(--md-sys-color-on-surface)" }}>
            {t(locale, "cards.materials.title")}
          </Typography>
          {groups.length > 1 && (
            <Box role="group" aria-label={t(locale, "cards.materials.title")} sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, maxWidth: "100%" }}>
              {groups.map((group) => (
                <ToggleButton
                  key={group.kind}
                  value={group.kind}
                  selected={group === current}
                  onChange={() => setActive(group.kind)}
                  sx={tabSx}
                >
                  {t(locale, LABEL_KEY[group.kind])}
                </ToggleButton>
              ))}
            </Box>
          )}
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: { xs: 3, sm: 4 } }}>
          {!current ? (
            <Typography variant="body2" sx={{ fontWeight: 500, color: "var(--md-sys-color-on-surface-variant)" }}>
              {t(locale, "cards.materials.empty")}
            </Typography>
          ) : (
            <>
              {current.alternative && (
                <Typography variant="caption" sx={{ fontWeight: 500, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {t(locale, "cards.materials.alternative")}{" "}
                  {current.alternative.link
                    ? <Link href={localizePath(entityLinkPath(current.alternative.link), locale)} underline="always" sx={{ fontWeight: 700, textDecorationStyle: "dotted", textUnderlineOffset: 4 }}>{current.alternative.name}</Link>
                    : <Box component="span" sx={{ fontWeight: 700, color: "var(--md-sys-color-on-surface)" }}>{current.alternative.name}</Box>}
                </Typography>
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
        </Box>
      </Card>
    </MdMuiProvider>
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

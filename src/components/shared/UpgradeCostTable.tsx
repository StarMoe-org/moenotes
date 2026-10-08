import { useMemo, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ToggleButton from "@mui/material/ToggleButton";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";

export interface UpgradeCost {
  name: string;
  /** Already resolved for the current server (e.g. through useAssetUrl). */
  imageUrl: string;
  count: number;
  /** Locale-free internal path (entityLinkPath) of the material's page; the chip becomes a link. */
  href?: string;
  /** Stable key across steps for the cumulative totals (default: `name`). */
  id?: string | number;
}

export interface UpgradeStep {
  from: string | number;
  to: string | number;
  costs: readonly UpgradeCost[];
}

export interface UpgradeCostTableProps {
  locale: AppLocale;
  steps: readonly UpgradeStep[];
  /** Header of the step column (default `designSystem.upgrade.step`). */
  stepHeader?: string;
  /** Header of the cost column (default `designSystem.upgrade.cost`). */
  costHeader?: string;
  /** Row label of a step (default "from → to"). */
  formatStep?: (step: UpgradeStep) => string;
  /** Shown when there are no steps (default `designSystem.upgrade.empty`). */
  emptyText?: string;
  /** Offer the "running total" toggle (default false). */
  cumulative?: boolean;
  /** Initial state of the running total toggle. */
  defaultCumulative?: boolean;
}

const headSx: SxProps<Theme> = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--md-sys-color-on-surface-variant)",
};

const toggleSx: SxProps<Theme> = {
  borderRadius: 999,
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

/** Steps with every cost summed over all steps up to and including each one (materials keep first-seen order). */
export function cumulativeUpgradeSteps(steps: readonly UpgradeStep[]): UpgradeStep[] {
  const totals = new Map<string | number, UpgradeCost>();
  return steps.map((step) => {
    for (const cost of step.costs) {
      const key = cost.id ?? cost.name;
      const previous = totals.get(key);
      totals.set(key, previous ? { ...previous, count: previous.count + cost.count } : { ...cost });
    }
    return { ...step, costs: [...totals.values()].map((cost) => ({ ...cost })) };
  });
}

/** Per-step material costs: one row per step, every material that step costs, with an optional running total. */
export default function UpgradeCostTable({
  locale,
  steps,
  stepHeader,
  costHeader,
  formatStep = (step) => `${step.from} → ${step.to}`,
  emptyText,
  cumulative = false,
  defaultCumulative = false,
}: UpgradeCostTableProps) {
  const [showTotal, setShowTotal] = useState(defaultCumulative);
  const visible = useMemo(() => steps.filter((step) => step.costs.length > 0), [steps]);
  const rows = useMemo(() => (cumulative && showTotal ? cumulativeUpgradeSteps(visible) : visible), [cumulative, showTotal, visible]);
  if (visible.length === 0) {
    return (
      <MdMuiProvider>
        <Typography variant="body2" sx={{ fontWeight: 500, color: "var(--md-sys-color-on-surface-variant)" }}>
          {emptyText ?? t(locale, "designSystem.upgrade.empty")}
        </Typography>
      </MdMuiProvider>
    );
  }
  const toggle = cumulative ? (
        <Box sx={{ mb: 1, display: "flex", justifyContent: "flex-end" }}>
          <ToggleButton
            value="cumulative"
            selected={showTotal}
            onChange={() => setShowTotal((value) => !value)}
            size="small"
            sx={toggleSx}
          >
            {t(locale, "designSystem.upgrade.cumulative")}
          </ToggleButton>
        </Box>
      ) : null;
  const table = (
      <Table size="small" sx={{ "& .MuiTableCell-root": { borderColor: "var(--md-sys-color-outline-variant)" } }}>
        <TableHead>
          <TableRow>
            <TableCell component="th" scope="col" sx={headSx}>{stepHeader ?? t(locale, "designSystem.upgrade.step")}</TableCell>
            <TableCell component="th" scope="col" sx={headSx}>{costHeader ?? t(locale, "designSystem.upgrade.cost")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((step) => (
            <TableRow key={`${step.from}-${step.to}`}>
              <TableCell component="th" scope="row" sx={{ fontWeight: 700, whiteSpace: "nowrap", verticalAlign: "top" }}>
                {formatStep(step)}
              </TableCell>
              <TableCell>
                <Box component="ul" sx={{ display: "flex", flexWrap: "wrap", gap: 1, m: 0, p: 0, listStyle: "none" }}>
                  {step.costs.map((cost) => {
                    const chipProps = {
                      size: "small",
                      variant: "outlined",
                      avatar: cost.imageUrl ? <Avatar src={cost.imageUrl} alt="" /> : undefined,
                      label: (
                        <span>
                          {cost.name}{" "}
                          <Box component="span" sx={{ fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                            ×{cost.count.toLocaleString(locale)}
                          </Box>
                        </span>
                      ),
                    } as const;
                    return (
                      <Box component="li" key={cost.id ?? cost.name} title={cost.name} sx={{ display: "flex" }}>
                        {cost.href ? (
                          <Chip {...chipProps} component="a" href={localizePath(cost.href, locale)} clickable sx={{ fontWeight: 500 }} />
                        ) : (
                          <Chip {...chipProps} sx={{ fontWeight: 500 }} />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
  );
  // Without the toggle the table is the root element, as the band item overlay always had it.
  return toggle ? <MdMuiProvider><div>{toggle}{table}</div></MdMuiProvider> : <MdMuiProvider>{table}</MdMuiProvider>;
}

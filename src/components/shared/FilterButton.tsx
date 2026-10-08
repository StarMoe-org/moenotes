import ToggleButton from "@mui/material/ToggleButton";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { ReactNode } from "react";

export interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  activeBg?: string;
  activeColor?: string;
  children: ReactNode;
}

/** A toggleable filter chip; selected state defaults to the M3 tonal fill. */
export default function FilterButton({
  active,
  onClick,
  activeBg,
  activeColor,
  children,
}: FilterButtonProps) {
  const selectedBg = activeBg ?? "var(--md-sys-color-secondary-container)";
  const selectedColor = activeColor ?? "var(--md-sys-color-on-secondary-container)";
  return (
    <MdMuiProvider>
      <ToggleButton
        value="filter"
        selected={active}
        onChange={() => onClick()}
        sx={{
          borderRadius: 2,
          px: 1.5,
          py: 0.75,
          fontSize: { xs: 12, sm: 14 },
          fontWeight: 700,
          textTransform: "none",
          border: "1px solid var(--md-sys-color-outline-variant)",
          color: "var(--md-sys-color-on-surface)",
          "&.Mui-selected": { bgcolor: selectedBg, color: selectedColor },
          "&.Mui-selected:hover": { bgcolor: selectedBg },
        }}
      >
        {children}
      </ToggleButton>
    </MdMuiProvider>
  );
}

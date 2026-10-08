import type { ReactNode } from "react";
import ToggleButton from "@mui/material/ToggleButton";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { CollectionView } from "@/lib/collection/use-collection-view";

export { useCollectionView, collectionViews, type CollectionView, type CollectionViewOptions } from "@/lib/collection/use-collection-view";

const ICONS: Record<CollectionView, ReactNode> = {
  card: <><rect x="1" y="1" width="6" height="8" rx="1" /><rect x="9" y="1" width="6" height="8" rx="1" /><rect x="1" y="11" width="6" height="4" rx="1" /><rect x="9" y="11" width="6" height="4" rx="1" /></>,
  square: <><rect x="1" y="1" width="4" height="4" rx=".8" /><rect x="6" y="1" width="4" height="4" rx=".8" /><rect x="11" y="1" width="4" height="4" rx=".8" /><rect x="1" y="6" width="4" height="4" rx=".8" /><rect x="6" y="6" width="4" height="4" rx=".8" /><rect x="11" y="6" width="4" height="4" rx=".8" /><rect x="1" y="11" width="4" height="4" rx=".8" /><rect x="6" y="11" width="4" height="4" rx=".8" /><rect x="11" y="11" width="4" height="4" rx=".8" /></>,
  grid: <><rect x="1" y="1" width="6" height="6" rx="1.2" /><rect x="9" y="1" width="6" height="6" rx="1.2" /><rect x="1" y="9" width="6" height="6" rx="1.2" /><rect x="9" y="9" width="6" height="6" rx="1.2" /></>,
  list: <><rect x="1" y="2" width="3" height="3" rx=".8" /><rect x="5.5" y="2.5" width="9.5" height="2" rx="1" /><rect x="1" y="6.5" width="3" height="3" rx=".8" /><rect x="5.5" y="7" width="9.5" height="2" rx="1" /><rect x="1" y="11" width="3" height="3" rx=".8" /><rect x="5.5" y="11.5" width="9.5" height="2" rx="1" /></>,
  table: <><rect x="1" y="1.5" width="14" height="3" rx=".8" /><rect x="1" y="6" width="4" height="2.5" rx=".6" /><rect x="6" y="6" width="9" height="2.5" rx=".6" /><rect x="1" y="10" width="4" height="2.5" rx=".6" /><rect x="6" y="10" width="9" height="2.5" rx=".6" /></>,
};

const buttonSx: SxProps<Theme> = {
  borderRadius: 2,
  textTransform: "none",
  fontSize: 12,
  fontWeight: 700,
  gap: 0.75,
  px: 1.5,
  py: 0.75,
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

export interface CollectionViewSwitchProps<V extends CollectionView> {
  locale: AppLocale;
  /** Views offered, in order. */
  views: readonly V[];
  value: V;
  onChange: (view: V) => void;
  /** Accessible group name (default `collectionView.label`). */
  label?: string;
  /** Button text per view (default `collectionView.<view>`). */
  labels?: Partial<Record<V, string>>;
  /** Hide the text on narrow screens, leaving the icon (the text stays the button's name). */
  compact?: boolean;
}

/** Segmented view switch in the server switch's style; pair with {@link useCollectionView}. */
export default function CollectionViewSwitch<V extends CollectionView>({ locale, views, value, onChange, label, labels, compact = false }: CollectionViewSwitchProps<V>) {
  return (
    <MdMuiProvider>
      <Box role="group" aria-label={label ?? t(locale, "collectionView.label")} sx={{ display: "flex", width: "fit-content", gap: 0.5 }}>
        {views.map((view) => {
          const text = labels?.[view] ?? t(locale, `collectionView.${view}`);
          return (
            <ToggleButton
              key={view}
              value={view}
              selected={view === value}
              onChange={() => onChange(view)}
              aria-label={compact ? text : undefined}
              title={compact ? text : undefined}
              sx={buttonSx}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{ICONS[view]}</svg>
              {compact ? <span className="hidden sm:inline">{text}</span> : text}
            </ToggleButton>
          );
        })}
      </Box>
    </MdMuiProvider>
  );
}

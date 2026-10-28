import Fab from "@mui/material/Fab";
import Zoom from "@mui/material/Zoom";
import { Icon } from "@/components/shared/icons";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilterState } from "@/lib/filter/quick-filter-store";
import { FILTER_DRAWER_ID } from "./FilterDrawer";

interface FilterTabHandleProps {
  locale: AppLocale;
  /** The route's filter title key: the button is in the server markup, before the page's island registers filters. */
  titleKey?: string | undefined;
}

/**
 * Opens the filter sheet: an extended FAB ("Filter") at the bottom of the content column, shown while the sheet is
 * closed. An open sheet closes from its own header (docked) or its scrim (modal), so the FAB never covers the page.
 *
 * The route knows its page has a filter sheet (`filterTitleKey`), so the button is in the server markup with the
 * final label and position (src/styles/global.css) instead of appearing once the island has registered its filters.
 * An open sheet keeps it hidden through `data-filter-open` on <html>, set before the first paint.
 */
export default function FilterTabHandle({ locale, titleKey }: FilterTabHandleProps) {
  const { hasFilters, isOpen, toggle, filterTitle } = useQuickFilterState();
  const visible = Boolean((hasFilters || titleKey) && !isOpen);
  const label = filterTitle || t(locale, titleKey ?? "filter.title");

  return (
    // `appear={false}`: the server-rendered button is already in place, so the first client commit must not replay
    // the zoom-in. Later openings (a sheet just closed) still animate.
    <Zoom in={visible} appear={false} unmountOnExit>
      <Fab
        variant="extended"
        color="primary"
        onClick={toggle}
        aria-controls={FILTER_DRAWER_ID}
        aria-expanded={isOpen}
        title={t(locale, "filter.openQuickFilter")}
        // Beneath the drawer's glass (z-30) like the content column: while the drawer folds, the button slides out
        // from under it instead of crossing over it.
        className="mn-filter-fab mn-shell-offset !fixed bottom-6 z-20"
      >
        <Icon name="filter" />
        <span className="max-w-[10rem] truncate">{label}</span>
      </Fab>
    </Zoom>
  );
}

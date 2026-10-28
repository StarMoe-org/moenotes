"use client";

import { useEffect, useId, useRef, useState } from "react";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import useScrollTrigger from "@mui/material/useScrollTrigger";
import useMediaQuery from "@mui/material/useMediaQuery";
import BrandLogo from "@/components/shared/BrandLogo";
import { Icon } from "@/components/shared/icons";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { toggleOverlay } from "@/lib/overlay/overlay-store";
import { useOverlay } from "@/lib/overlay/use-overlay";
import type { HeaderCrumb } from "@/lib/route/header-crumbs";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";

interface Props {
  locale: AppLocale;
  homeHref: string;
  crumbs: HeaderCrumb[];
}

/**
 * Top app bar, as MoeSekai lays it out: transparent, with its controls grouped in floating glass capsules (navigation,
 * brand and, from `md`, the breadcrumb trail, each crumb with a menu of its sibling pages; search; settings). Content
 * scrolling under it fades out through the scroll edge, and the capsules thicken. Below `md` the trail takes a second
 * row in its own capsule (and --md-app-bar-height grows to match, see src/styles/tokens.css).
 */
function TopAppBar({ locale, homeHref, crumbs }: Props) {
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 4 });
  const { isOpen: mobileOpen, toggle: toggleMobile } = useOverlay("mobile-sidebar");
  const [desktopOpen, toggleDesktop] = useSidebarState();
  const [shortcut, setShortcut] = useState("Ctrl K");

  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl K");
  }, []);

  const desktop = useMediaQuery("(min-width: 768px)");
  const toggleNav = () => {
    if (desktop) toggleDesktop();
    else toggleMobile();
  };
  // The drawer this viewport uses: docked from md, modal below (its own state, closed until opened).
  const navOpen = desktop ? desktopOpen : mobileOpen;

  return (
    <header className="mn-top-app-bar scroll-edge fixed inset-x-0 top-0 z-[1100] text-on-surface" data-scrolled={scrolled ? "" : undefined}>
      <div className="mx-auto flex h-16 w-full max-w-[var(--mn-layout-max-width,120rem)] items-center gap-2 px-2 sm:px-3">
        <div className="glass flex h-12 min-w-0 items-center gap-1 rounded-full pl-1 pr-2 md:pr-3">
          <Tooltip title={t(locale, navOpen ? "shell.closeSidebar" : "shell.openSidebar")}>
            <IconButton
              aria-label={t(locale, navOpen ? "shell.closeSidebar" : "shell.openSidebar")}
              aria-expanded={navOpen}
              onClick={toggleNav}
              sx={{ color: "var(--md-sys-color-on-surface)" }}
            >
              <Icon name={mobileOpen ? "close" : "menu"} />
            </IconButton>
          </Tooltip>
          <a href={homeHref} className="md3-state flex shrink-0 items-center rounded-full px-1 py-1 text-on-surface" aria-label={t(locale, "nav.home")}>
            <BrandLogo className="mn-brand-shell" />
          </a>
          <Breadcrumbs locale={locale} crumbs={crumbs} />
        </div>
        <div className="min-w-0 flex-1" />
        <ButtonBase
          onClick={() => toggleOverlay("command")}
          aria-label={t(locale, "shell.openCommandPalette")}
          className="glass md3-state !hidden h-12 w-72 shrink items-center gap-2 !rounded-full !pl-4 !pr-3 !text-on-surface-variant lg:!flex"
        >
          <Icon name="search" className="h-5 w-5" />
          <span className="min-w-0 flex-1 truncate text-left text-body-medium">{t(locale, "shell.searchPlaceholder")}</span>
          <kbd className="inline-flex h-6 items-center rounded-shape-xs border border-outline-variant px-1.5 font-sans text-label-small">{shortcut}</kbd>
        </ButtonBase>
        <div className="glass flex h-12 shrink-0 items-center gap-0.5 rounded-full px-1">
          <Tooltip title={t(locale, "shell.openCommandPalette")}>
            <IconButton className="lg:!hidden" aria-label={t(locale, "shell.openCommandPalette")} onClick={() => toggleOverlay("command")}>
              <Icon name="search" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t(locale, "shell.openSettings")}>
            <IconButton aria-label={t(locale, "shell.openSettings")} onClick={() => toggleOverlay("settings")}>
              <Icon name="settings" />
            </IconButton>
          </Tooltip>
        </div>
      </div>
      {crumbs.length > 0 && (
        <div className="mn-app-bar-trail flex h-10 items-start px-2 md:hidden">
          <div className="glass flex h-9 min-w-0 max-w-full items-center rounded-full px-1.5">
            <Breadcrumbs locale={locale} crumbs={crumbs} row />
          </div>
        </div>
      )}
    </header>
  );
}

function Breadcrumbs({ locale, crumbs, row = false }: { locale: AppLocale; crumbs: HeaderCrumb[]; row?: boolean }) {
  const scrollRef = useRef<HTMLElement>(null);
  // A trail wider than its box scrolls sideways; start at its end so the current page is the crumb in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [crumbs]);
  if (crumbs.length === 0) return null;
  return (
    <nav
      ref={scrollRef}
      aria-label={t(locale, "shell.breadcrumb")}
      className={`no-scrollbar min-w-0 overflow-x-auto ${row ? "flex" : "flex max-md:hidden"}`}
    >
      <ol className="flex min-w-max items-center gap-0.5 text-body-medium text-on-surface-variant">
        {crumbs.map((crumb, index) => (
          <li key={crumb.id} className="flex items-center gap-0.5">
            {/* Beside the brand every crumb takes a separator; on its own row the trail starts with the first crumb. */}
            {(!row || index > 0) && <span aria-hidden="true" className="px-0.5 text-outline">/</span>}
            <Crumb locale={locale} crumb={crumb} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Crumb({ locale, crumb }: { locale: AppLocale; crumb: HeaderCrumb }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const open = Boolean(anchor);
  const menuLabel = crumb.picker ? t(locale, "shell.breadcrumbSelectPage") : t(locale, crumb.groupMenu ? "shell.breadcrumbExpandGroup" : "shell.breadcrumbExpandItems");
  // Plain text on the glass, as on MoeSekai: the current page reads in on-surface, its ancestors recede.
  const chip = crumb.current ? "text-on-surface" : "text-on-surface-variant";

  return (
    <>
      {crumb.picker ? (
        <ButtonBase
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
          className={`md3-state h-8 gap-1 !rounded-full !pl-3 !pr-1.5 text-label-large ${chip}`}
        >
          <span>{menuLabel}</span>
          <Icon name="chevronDown" className={`h-[18px] w-[18px] transition-transform ${open ? "rotate-180" : ""}`} />
        </ButtonBase>
      ) : (
        <span className={`flex h-8 items-center overflow-hidden rounded-full ${chip}`}>
          <a href={crumb.href} aria-current={crumb.current ? "page" : undefined} className={`md3-state flex h-full max-w-[14rem] items-center truncate text-label-large ${crumb.options.length > 0 ? "pl-2.5 pr-1" : "px-2.5"}`}>
            <span className="truncate">{crumb.label}</span>
          </a>
          {crumb.options.length > 0 && (
            <ButtonBase
              aria-label={menuLabel}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              onClick={(event) => setAnchor(event.currentTarget)}
              className="md3-state h-full !rounded-full !px-1"
            >
              <Icon name="chevronDown" className={`h-[18px] w-[18px] transition-transform ${open ? "rotate-180" : ""}`} />
            </ButtonBase>
          )}
        </span>
      )}
      {crumb.options.length > 0 && (
        <Menu id={menuId} anchorEl={anchor} open={open} onClose={() => setAnchor(null)} slotProps={{ list: { "aria-label": menuLabel, dense: true } }}>
          {crumb.options.map((option) => (
            <MenuItem key={option.href} component="a" href={option.href} selected={option.current} aria-current={option.current ? "page" : undefined}>
              {option.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  );
}

export default withMd3(TopAppBar);

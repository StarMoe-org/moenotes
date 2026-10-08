import { useMemo, useState, type MouseEvent } from "react";
import MuiBreadcrumbs from "@mui/material/Breadcrumbs";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import { buildBreadcrumbs } from "@/lib/route/breadcrumbs";
import { findRouteMatch, getNavChildren, getNavigationGroups } from "@/lib/route/registry";
import type { AppRoute, BreadcrumbDetail, BreadcrumbItem } from "@/types/route";

interface Props {
  locale: AppLocale;
  pathname: string;
  detail?: BreadcrumbDetail | undefined;
  detailLabel?: string | undefined;
  mode?: "desktop" | "mobile";
}

const PLACEHOLDER_ID = "__placeholder__";

/** Breadcrumb trail with per-crumb sibling navigation, rendered with M3 chips, links and menus. */
export default function Breadcrumbs({ locale, pathname, detail, detailLabel, mode = "desktop" }: Props) {
  const crumbs = buildBreadcrumbs(pathname, locale, detail ?? (detailLabel ? { label: detailLabel } : undefined));
  const match = findRouteMatch(pathname);
  const groups = getNavigationGroups();

  const visibleCrumbs = useMemo(() => {
    const list = crumbs.slice(1).map((crumb) => ({ ...crumb }));
    if (match?.isGroupLanding) {
      const children = getNavChildren(match.item);
      if (children.length > 0) {
        list.push({ id: PLACEHOLDER_ID, label: "...", href: "", current: true });
        const prevCrumb = list[list.length - 2];
        if (prevCrumb) prevCrumb.current = false;
      }
    }
    return list;
  }, [crumbs, match]);

  const getOptionsForCrumb = (crumb: BreadcrumbItem): AppRoute[] => {
    if (!match) return [];
    if (crumb.id === PLACEHOLDER_ID) return getNavChildren(match.item);
    if (groups.some((g) => g.id === crumb.id)) return groups;
    const parentGroup = groups.find((g) => getNavChildren(g).some((child) => child.id === crumb.id));
    if (parentGroup) return getNavChildren(parentGroup);
    return [];
  };

  const [menuCrumbId, setMenuCrumbId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const openMenu = (crumbId: string) => (event: MouseEvent<HTMLElement>) => {
    setMenuCrumbId(crumbId);
    setAnchorEl(event.currentTarget);
  };
  const closeMenu = () => {
    setMenuCrumbId(null);
    setAnchorEl(null);
  };
  const menuCrumb = menuCrumbId ? visibleCrumbs.find((crumb) => crumb.id === menuCrumbId) ?? null : null;
  const menuOptions = menuCrumb ? getOptionsForCrumb(menuCrumb) : [];
  const small = mode === "mobile";

  return (
    <MdMuiProvider>
      <MuiBreadcrumbs
        aria-label="Breadcrumb"
        separator={<span aria-hidden="true">/</span>}
        sx={{
          display: mode === "desktop" ? { xs: "none", md: "block" } : undefined,
          minWidth: 0,
          "& .MuiBreadcrumbs-ol": { flexWrap: "nowrap", alignItems: "center", gap: small ? 0.5 : 1 },
          "& .MuiBreadcrumbs-separator": { color: "var(--md-sys-color-primary)", fontWeight: 900, mx: 0 },
          "& .MuiBreadcrumbs-li": { display: "flex", minWidth: 0, alignItems: "center", gap: 0.5 },
        }}
      >
        {visibleCrumbs.map((crumb) => {
          const options = getOptionsForCrumb(crumb);
          const isPlaceholder = crumb.id === PLACEHOLDER_ID;
          const expandLabel = t(locale, crumb.id === match?.group?.id ? "shell.breadcrumbExpandGroup" : "shell.breadcrumbExpandItems");
          return (
            <span key={crumb.id} style={{ display: "flex", minWidth: 0, alignItems: "center", gap: 2 }}>
              {isPlaceholder ? (
                options.length > 0 && (
                  <Chip
                    size="small"
                    label="..."
                    clickable
                    onClick={openMenu(crumb.id)}
                    aria-haspopup="menu"
                    aria-expanded={menuCrumbId === crumb.id}
                    aria-label={t(locale, "shell.breadcrumbExpandItems")}
                    sx={{ fontWeight: 700 }}
                  />
                )
              ) : crumb.current ? (
                <a href={crumb.href} aria-current="page" aria-label={crumb.label} style={{ minWidth: 0, textDecoration: "none" }}>
                  <Chip
                    size="small"
                    label={crumb.label}
                    sx={{
                      maxWidth: "100%",
                      fontWeight: 700,
                      bgcolor: "var(--md-sys-color-secondary-container)",
                      color: "var(--md-sys-color-on-secondary-container)",
                    }}
                  />
                </a>
              ) : (
                <Link
                  href={crumb.href}
                  underline="hover"
                  aria-label={crumb.label}
                  sx={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: small ? 12 : 14,
                    fontWeight: 700,
                    color: "var(--md-sys-color-on-surface-variant)",
                  }}
                >
                  {crumb.label}
                </Link>
              )}
              {!isPlaceholder && options.length > 0 && (
                <IconButton
                  size="small"
                  onClick={openMenu(crumb.id)}
                  aria-haspopup="menu"
                  aria-expanded={menuCrumbId === crumb.id}
                  aria-label={expandLabel}
                  sx={{ width: small ? 20 : 28, height: small ? 20 : 28 }}
                >
                  <ExpandMoreIcon fontSize="small" />
                </IconButton>
              )}
            </span>
          );
        })}
      </MuiBreadcrumbs>
      <Menu anchorEl={anchorEl} open={menuCrumbId !== null} onClose={closeMenu} slotProps={{ list: { "aria-label": t(locale, "shell.breadcrumbExpandItems") } }}>
        {menuOptions.map((item) => (
          <MenuItem
            key={item.id}
            component="a"
            href={localizePath(item.path, locale)}
            selected={menuCrumb !== null && !isPlaceholderId(menuCrumb.id) && item.id === menuCrumb.id}
            aria-current={menuCrumb !== null && item.id === menuCrumb.id ? "page" : undefined}
            aria-label={t(locale, item.labelKey)}
            onClick={closeMenu}
          >
            {t(locale, item.labelKey)}
          </MenuItem>
        ))}
      </Menu>
    </MdMuiProvider>
  );
}

function isPlaceholderId(id: string): boolean {
  return id === PLACEHOLDER_ID;
}

import { useState, type MouseEvent } from "react";
import Divider from "@mui/material/Divider";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import CollectionIcon from "./CollectionIcon";

export default function CollectionActionMenu({ locale, busy, onAdd, onExport, onImport, onStorage, onDelete }: {
  locale: AppLocale; busy: boolean; onAdd?: (() => void) | undefined; onImport?: (() => void) | undefined;
  onExport?: (() => void) | undefined; onStorage?: (() => void) | undefined; onDelete?: (() => void) | undefined;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = anchorEl !== null;
  const label = (key: string) => t(locale, `deckWorkspace.collection.${key}`);

  const handleOpen = (event: MouseEvent<HTMLButtonElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const finish = (action: () => void) => {
    handleClose();
    action();
  };

  return (
    <MdMuiProvider>
      <button
        type="button"
        className="cb-secondary-action"
        disabled={busy}
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "collection-actions" : undefined}
      >
        <CollectionIcon name="more" />{label("actions")}
      </button>
      <Menu
        id="collection-actions"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 250 } }, list: { "aria-label": label("actions") } }}
      >
        {onAdd && (
          <MenuItem disabled={busy} onClick={() => finish(onAdd)}>
            <ListItemIcon><CollectionIcon name="add" /></ListItemIcon>
            <ListItemText>{label("add")}</ListItemText>
          </MenuItem>
        )}
        <Divider />
        <Typography variant="caption" sx={{ display: "block", px: 2, pt: 1, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)" }}>
          {label("backup")}
        </Typography>
        {onExport && (
          <MenuItem disabled={busy} onClick={() => finish(onExport)}>
            <ListItemIcon><CollectionIcon name="export" /></ListItemIcon>
            <ListItemText>{label("export")}</ListItemText>
          </MenuItem>
        )}
        {onImport && (
          <MenuItem disabled={busy} onClick={() => finish(onImport)}>
            <ListItemIcon><CollectionIcon name="import" /></ListItemIcon>
            <ListItemText>{label("import")}</ListItemText>
          </MenuItem>
        )}
        <Typography variant="body2" sx={{ px: 2, py: 0.5, color: "var(--md-sys-color-on-surface-variant)" }}>
          {label("backupNote")}
        </Typography>
        {onStorage && (
          <MenuItem disabled={busy} onClick={() => finish(onStorage)}>
            <ListItemIcon><CollectionIcon name="storage" /></ListItemIcon>
            <ListItemText>{label("storage")}</ListItemText>
          </MenuItem>
        )}
        {onDelete && (
          <MenuItem disabled={busy} onClick={() => finish(onDelete)} sx={{ color: "var(--md-sys-color-error)" }}>
            <ListItemIcon sx={{ color: "inherit" }}><CollectionIcon name="delete" /></ListItemIcon>
            <ListItemText>{label("delete")}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </MdMuiProvider>
  );
}

import { useState, type MouseEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlined";
import { accountApi, accountLoginUrl } from "@/config/account";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import AccountAvatar from "@/components/account/AccountAvatar";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import { accountAvatarUrl } from "@/lib/account/avatar-url";
import { useAccount } from "@/lib/account/use-account";
import { getRoutePathById } from "@/lib/route/registry";

interface Props {
  locale: AppLocale;
  /** Current page, so signing in comes back to it (the component is server-rendered first). */
  pathname: string;
}

/** The pinned account pane at the foot of the sidebar: sign-in, or the signed-in user with a small menu. */
export default function SidebarAccount({ locale, pathname }: Props) {
  const account = useAccount();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = anchorEl !== null;

  // Signed out, still loading, or no account API on this deployment: sign-in link, or nothing at all.
  if (account?.status !== "signed-in") {
    if (account?.status !== "signed-out") return null;
    return (
      <MdMuiProvider>
        <Box sx={{ borderTop: 1, borderTopStyle: "dashed", borderColor: "var(--md-sys-color-outline-variant)", px: 1.5, py: 1.5 }}>
          <Button variant="outlined" fullWidth startIcon={<PersonOutlineIcon />} component="a" href={accountLoginUrl(locale, pathname)}>
            {t(locale, "account.signIn")}
          </Button>
        </Box>
      </MdMuiProvider>
    );
  }

  const { user } = account;
  const displayName = user.name ?? user.username ?? t(locale, "account.passport");

  const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  return (
    <MdMuiProvider>
      <Box sx={{ borderTop: 1, borderTopStyle: "dashed", borderColor: "var(--md-sys-color-outline-variant)", px: 1.5, py: 1.5 }}>
        <ListItemButton
          onClick={handleOpen}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t(locale, "account.menu")}
          sx={{ borderRadius: 3, px: 1 }}
        >
          <ListItemAvatar sx={{ minWidth: 44 }}>
            <AccountAvatar url={accountAvatarUrl(user)} name={displayName} className="h-9 w-9 rounded-xl text-sm" />
          </ListItemAvatar>
          <ListItemText
            primary={displayName}
            secondary={t(locale, "account.passport")}
            slotProps={{
              primary: { noWrap: true, sx: { fontSize: 13, fontWeight: 700 } },
              secondary: { noWrap: true, sx: { fontSize: 11 } },
            }}
          />
          <ExpandMoreIcon fontSize="small" color="action" sx={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} />
        </ListItemButton>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          anchorOrigin={{ vertical: "top", horizontal: "left" }}
          transformOrigin={{ vertical: "bottom", horizontal: "left" }}
          slotProps={{ list: { "aria-label": t(locale, "account.menu") } }}
        >
          <MenuItem component="a" href={localizePath(getRoutePathById("account"), locale)} onClick={handleClose}>
            {t(locale, "account.manage")}
          </MenuItem>
          <form method="post" action={accountApi.logout}>
            <MenuItem component="button" type="submit" sx={{ width: "100%" }}>
              {t(locale, "account.signOut")}
            </MenuItem>
          </form>
        </Menu>
      </Box>
    </MdMuiProvider>
  );
}

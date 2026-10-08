import ToggleButton from "@mui/material/ToggleButton";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import { GAME_SERVERS, type GameServer } from "@/config/servers";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import ServerFlag from "@/components/shared/ServerFlag";

interface Props {
  locale: AppLocale;
  value: GameServer | null;
  onChange: (server: GameServer) => void;
  /** The servers to offer (every server by default). */
  servers?: readonly GameServer[];
}

const buttonSx: SxProps<Theme> = {
  borderRadius: 2,
  px: 1.25,
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
  "&:not(.Mui-selected)": {
    opacity: 0.6,
    "&:hover": { opacity: 1 },
  },
};

/** Picks the game server; `value` is null until the browser has read the stored choice. */
export default function GameServerSwitch({ locale, value, onChange, servers = GAME_SERVERS }: Props) {
  return (
    <MdMuiProvider>
      <Box role="group" aria-label={t(locale, "gameServer.label")} sx={{ display: "flex", width: "fit-content", gap: 0.5 }}>
        {servers.map((server) => (
          <ToggleButton
            key={server}
            value={server}
            selected={server === value}
            onChange={() => onChange(server)}
            title={t(locale, `gameServer.names.${server}`)}
            aria-label={t(locale, `gameServer.names.${server}`)}
            sx={buttonSx}
          >
            {/* The flag alone marks the server; the name is in the title and the accessible label. */}
            <ServerFlag server={server} />
          </ToggleButton>
        ))}
      </Box>
    </MdMuiProvider>
  );
}

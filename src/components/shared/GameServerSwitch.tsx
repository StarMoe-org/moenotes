"use client";

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

/** Picks the game server; `value` is null until the browser has read the stored choice. */
export default function GameServerSwitch({ locale, value, onChange, servers = GAME_SERVERS }: Props) {
  return (
    <div className="md3-segmented w-fit" role="group" aria-label={t(locale, "gameServer.label")}>
      {servers.map((server) => (
        <button
          key={server}
          type="button"
          onClick={() => onChange(server)}
          aria-pressed={server === value}
          title={t(locale, `gameServer.names.${server}`)}
          className="md3-segment md3-state"
        >
          {/* The short name says which server; the flag only helps the eye, so phones drop it to keep one row. */}
          <ServerFlag server={server} className="hidden h-4 w-4 sm:block" />
          <span>{t(locale, `gameServer.short.${server}`)}</span>
        </button>
      ))}
    </div>
  );
}

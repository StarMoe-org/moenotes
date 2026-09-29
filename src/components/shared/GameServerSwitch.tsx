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
    <div className="mn-segmented flex w-fit gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={t(locale, "gameServer.label")}>
      {servers.map((server) => (
        <button
          key={server}
          type="button"
          onClick={() => onChange(server)}
          aria-pressed={server === value}
          title={t(locale, `gameServer.names.${server}`)}
          aria-label={t(locale, `gameServer.names.${server}`)}
          className={`mn-focus flex items-center rounded-full px-2.5 py-1.5 transition ${server === value ? "bg-[var(--mn-accent-soft)]" : "opacity-60 hover:bg-[var(--mn-cream-deep)] hover:opacity-100"}`}
        >
          {/* The flag alone marks the server; the name is in the title and the accessible label. */}
          <ServerFlag server={server} />
        </button>
      ))}
    </div>
  );
}

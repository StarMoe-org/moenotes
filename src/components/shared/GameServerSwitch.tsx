import { GAME_SERVERS, type GameServer } from "@/config/game-api";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

interface Props {
  locale: AppLocale;
  value: GameServer | null;
  onChange: (server: GameServer) => void;
}

/** Picks the game server; `value` is null until the browser has read the stored choice. */
export default function GameServerSwitch({ locale, value, onChange }: Props) {
  return (
    <div className="mn-segmented flex w-fit gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={t(locale, "gameServer.label")}>
      {GAME_SERVERS.map((server) => (
        <button
          key={server}
          type="button"
          onClick={() => onChange(server)}
          aria-pressed={server === value}
          title={t(locale, `gameServer.names.${server}`)}
          className={`mn-focus rounded-full px-3 py-1 text-xs font-bold transition ${server === value ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
        >
          {t(locale, `gameServer.short.${server}`)}
        </button>
      ))}
    </div>
  );
}

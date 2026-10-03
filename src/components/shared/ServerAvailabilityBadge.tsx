import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import ServerFlag from "@/components/shared/ServerFlag";
import { missingServers } from "@/lib/servers/facets";
import { serverList } from "@/lib/servers/use-content-server";

export interface ServerAvailabilityBadgeProps {
  locale: AppLocale;
  /** A merged entity (ServerFaceted / ServerFacetedValue): the servers whose MasterData has it. */
  entity: { servers?: readonly GameServer[] } | null | undefined;
  /** The build's servers (getBuildServers / the page's `servers` prop). */
  servers: readonly GameServer[];
  size?: "sm" | "md";
  /** Also print the "JP only" text after the flags. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Flags of the servers that have an entity, shown only when some of the build's servers lack it. Renders nothing when
 * every server has it (or when the entity carries no server list).
 */
export default function ServerAvailabilityBadge({ locale, entity, servers, size = "sm", showLabel = false, className = "" }: ServerAvailabilityBadgeProps) {
  const entityServers = entity?.servers;
  if (!entityServers?.length) return null;
  const available = servers.filter((server) => entityServers.includes(server));
  if (!available.length || !missingServers({ servers: available }, servers).length) return null;
  const label = t(locale, "gameServer.onlyOn", { servers: serverList(locale, available) });
  const flag = size === "md" ? "h-4.5 w-4.5" : "h-3.5 w-3.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[var(--mn-text-muted)] ${className}`}
      title={label}
      role={showLabel ? undefined : "img"}
      aria-label={showLabel ? undefined : label}
    >
      <span className="flex items-center -space-x-1">
        {available.map((server) => <ServerFlag key={server} server={server} className={`${flag} ring-1 ring-[var(--mn-paper)]`} />)}
      </span>
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}

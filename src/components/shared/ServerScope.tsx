import type { ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import { entityServer } from "@/lib/servers/facets";
import { ContentServerProvider, serverList } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  /** The build's servers. */
  servers: readonly GameServer[];
  /** The server the page shows (useContentServer). */
  server: GameServer;
  onChange: (server: GameServer) => void;
  /**
   * The servers that have the page's entity, on a detail page: its files come from the page's server when that has
   * it, else from the first of these, and a note says so.
   */
  entityServers?: readonly GameServer[];
  /** Leave the switch to another island of the page (it changes the same setting). */
  hideSwitch?: boolean;
  /** Page controls at the end of the switch row, e.g. a list's display switch; shown even with one server. */
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * One server's content: the server switch (only when the build has several servers) above `children`, which show that
 * server's files. See docs/servers.md.
 */
export default function ServerScope({ locale, servers, server, onChange, entityServers, hideSwitch = false, actions, children }: Props) {
  const source = entityServers ? entityServer({ servers: entityServers }, server) : server;
  const showSwitch = servers.length > 1 && !hideSwitch;
  return (
    <ContentServerProvider server={source} servers={servers}>
      {(showSwitch || actions) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {showSwitch && <GameServerSwitch locale={locale} value={server} onChange={onChange} servers={servers} />}
          {showSwitch && entityServers && <AvailabilityNote locale={locale} servers={servers} server={server} source={source} entityServers={entityServers} />}
          {actions && <div className="ml-auto">{actions}</div>}
        </div>
      )}
      {children}
    </ContentServerProvider>
  );
}

function AvailabilityNote({ locale, servers, server, source, entityServers }: {
  locale: AppLocale;
  servers: readonly GameServer[];
  server: GameServer;
  source: GameServer;
  entityServers: readonly GameServer[];
}) {
  const available = entityServers.filter((entry) => servers.includes(entry));
  if (!available.length) return null;
  const text = source !== server
    ? t(locale, "gameServer.notOnServer", { server: t(locale, `gameServer.names.${server}`), source: t(locale, `gameServer.names.${source}`) })
    : available.length < servers.length
      ? t(locale, "gameServer.onlyOn", { servers: serverList(locale, available) })
      : "";
  if (!text) return null;
  return (
    <p className={`text-xs font-bold ${source !== server ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)]"}`} role="status">
      {text}
    </p>
  );
}

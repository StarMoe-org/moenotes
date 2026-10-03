import { useRef } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Popover from "@/components/shared/Popover";
import CollectionIcon from "./CollectionIcon";

export default function CollectionActionMenu({ locale, busy, onAdd, onExport, onImport, onStorage, onDelete }: {
  locale: AppLocale; busy: boolean; onAdd: () => void; onImport: () => void;
  onExport?: (() => void) | undefined; onStorage?: (() => void) | undefined; onDelete?: (() => void) | undefined;
}) {
  const label = (key: string) => t(locale, `deckWorkspace.collection.${key}`);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement>(null);
  return <Popover align="end" minWidth={250} panelClassName="cb-action-popover" trigger={props => <button type="button" {...props} ref={node => { trigger.current = node; props.ref(node); }} className="cb-secondary-action" disabled={busy} onClick={() => {
    props.onClick(); requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true }));
  }}><CollectionIcon name="more" />{label("actions")}</button>}>
    {({ close }) => {
      const finish = (action: () => void) => { close(); trigger.current?.focus({ preventScroll: true }); action(); };
      return <div className="cb-action-menu" ref={menu} role="group" aria-label={label("actions")} onKeyDown={event => {
        if (event.key === "Tab") { event.preventDefault(); close(); trigger.current?.focus({ preventScroll: true }); return; }
        const entries = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        if (!entries.length) return;
        const index = entries.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (index + 1) % entries.length : event.key === "ArrowUp" ? (index + entries.length - 1) % entries.length : event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); entries[next]!.focus();
      }}>
        <button type="button" role="menuitem" disabled={busy} onClick={() => finish(onAdd)}><CollectionIcon name="add" />{label("add")}</button>
        <div className="cb-menu-label">{label("backup")}</div>
        {onExport && <button type="button" role="menuitem" disabled={busy} onClick={() => finish(onExport)}><CollectionIcon name="export" />{label("export")}</button>}
        <button type="button" role="menuitem" disabled={busy} onClick={() => finish(onImport)}><CollectionIcon name="import" />{label("import")}</button>
        <p>{label("backupNote")}</p>
        {onStorage && <button type="button" role="menuitem" disabled={busy} onClick={() => finish(onStorage)}><CollectionIcon name="storage" />{label("storage")}</button>}
        {onDelete && <button type="button" role="menuitem" className="cb-delete-action" disabled={busy} onClick={() => finish(onDelete)}><CollectionIcon name="delete" />{label("delete")}</button>}
      </div>;
    }}
  </Popover>;
}

import { useRef, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { md3Cx, md3TabClass } from "@/lib/md3/classes";

export interface MdTabsProps extends HTMLAttributes<HTMLDivElement> {
  secondary?: boolean;
  children?: ReactNode;
}

/** M3 tab list container (role=tablist) with arrow-key roving between MdTab children. */
export function MdTabs({ secondary = false, className, children, ...rest }: MdTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const list = listRef.current;
    if (!list) return;
    const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')].filter((tab) => tab.tabIndex >= 0 || document.activeElement === tab);
    if (tabs.length === 0) return;
    const current = tabs.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = tabs[(current + delta + tabs.length) % tabs.length];
    event.preventDefault();
    next?.focus();
    next?.click();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      className={md3Cx("md3-tabs", secondary && "md3-tabs--secondary", className)}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface MdTabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

/** M3 tab. Controlled via active + onClick; the parent MdTabs handles arrow keys. */
export function MdTab({ active = false, icon, className, children, ...rest }: MdTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={md3Cx(md3TabClass(active), className)}
      {...rest}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}

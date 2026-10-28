"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * The next index of a roving-focus group (tabs, radios) for an arrow / Home / End key, wrapping around; null for any
 * other key.
 */
export function rovingStep(key: string, index: number, count: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  return step === 0 ? null : (Math.max(index, 0) + step + count) % count;
}

export interface PrimaryTab<T extends string> {
  value: T;
  label: ReactNode;
  /** Drawn over the label, which makes the tab 64px tall. */
  icon?: ReactNode;
}

interface PrimaryTabsProps<T extends string> {
  tabs: ReadonlyArray<PrimaryTab<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tab row. */
  label: string;
  /** Element id of a tab, for its panel's aria-labelledby. */
  tabId: (value: T) => string;
  /** Id of the panel the tabs switch. */
  panelId: string;
  className?: string;
}

/**
 * Material 3 primary tabs, as MoeSekai sets them: equal widths, the indicator only as wide as the chosen tab's icon and
 * label, sliding from tab to tab. Arrow keys, Home and End choose a tab and move focus to it.
 */
export default function PrimaryTabs<T extends string>({ tabs, value, onChange, label, tabId, panelId, className = "" }: PrimaryTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const content = list?.querySelector<HTMLElement>('[aria-selected="true"] [data-tab-content]');
    if (!list || !content) return;
    const update = () => {
      const listRect = list.getBoundingClientRect();
      const rect = content.getBoundingClientRect();
      setIndicator({ left: rect.left - listRect.left + list.scrollLeft, width: rect.width });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    observer.observe(content);
    return () => observer.disconnect();
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = rovingStep(event.key, tabs.findIndex((tab) => tab.value === value), tabs.length);
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next]!.value;
    onChange(tab);
    document.getElementById(tabId(tab))?.focus();
  };

  return (
    <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={`md3-tabs relative ${className}`}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={tabId(tab.value)}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            // The tab row scrolls (clips), so the focus ring is drawn inside the tab; the indicator is the span below.
            className={`md3-tab md3-state flex-1 after:hidden focus-visible:outline-offset-[-3px] ${tab.icon ? "h-16" : "h-12"}`}
          >
            <span data-tab-content className="flex flex-col items-center gap-1">
              {tab.icon}
              {tab.label}
            </span>
          </button>
        );
      })}
      {indicator && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 h-[3px] rounded-t-[3px] bg-primary transition-[left,width] duration-300 ease-emphasized"
          style={indicator}
        />
      )}
    </div>
  );
}

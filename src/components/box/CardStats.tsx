"use client";

import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { BoxCard, CardFieldName, CardKind } from "@/lib/box/model";
import "@/styles/card-stats.css";

/** The values a card kind records, in reading order: level first, then the 1–5 steps. */
export const STAT_FIELDS: Readonly<Record<CardKind, readonly CardFieldName[]>> = {
  member: ["level", "awake", "rank", "liveSkillLevel", "gekisouSkillLevel"],
  snap: ["level", "rank"],
};
/** The 1–5 steps reach their maximum at 5. */
export const STEP_MAX = 5;

/** A 1–5 step as five segments filled up to its value, then the number; an unknown step leaves every segment empty. */
export function StepMeter({ value }: { value: number | null }) {
  return <span className="cs-meter" data-max={value === STEP_MAX || undefined} data-unknown={value === null || undefined}>
    <span className="cs-pips" aria-hidden="true">{Array.from({ length: STEP_MAX }, (_, index) => <span key={index} data-on={(value !== null && index < value) || undefined} />)}</span>
    <span className="cs-num">{value ?? "—"}</span>
  </span>;
}

/**
 * A card's recorded values: the level, then each step as a short label beside its meter. Labels, meters and numbers
 * line up in columns, steps at their maximum are marked and unknown values show a dash, so a row of cards reads at a
 * glance which ones are finished. Wide enough, the steps sit two to a row beside the level.
 */
export default function CardStats({ locale, card, className = "" }: { locale: AppLocale; card: BoxCard; className?: string }) {
  const tr = (key: string) => t(locale, `deckWorkspace.${key}`);
  return <div className={`cs ${className}`.trim()}><dl className="cs-stats" data-kind={card.kind}>
    {STAT_FIELDS[card.kind].map(name => {
      const value = card.fields[name].value;
      const label = name === "level" ? tr("collection.cultivationLevel") : tr(name);
      return <div key={name} data-field={name} data-max={name !== "level" && value === STEP_MAX ? "true" : undefined} title={`${label} ${value ?? tr("unknown")}`}>
        <dt>{tr(`statShort.${name}`)}</dt>
        <dd aria-label={value === null ? tr("unknown") : undefined}>{name === "level" ? value ?? "—" : <StepMeter value={value} />}</dd>
      </div>;
    })}
  </dl></div>;
}

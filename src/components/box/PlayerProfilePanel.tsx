import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { PlayerProfileFieldView, PlayerProfileGroupView, PlayerProfileLabels, PlayerProfilePanelProps } from "@/lib/box/player-profile-view";
import "@/styles/player-profile.css";
import CharacterRankArtwork from "@/components/shared/CharacterRankArtwork";

type Section = PlayerProfileGroupView["section"];
type ProfileStyle = CSSProperties & { [key: `--pp-${string}`]: string | undefined };
const sections: readonly Section[] = ["characters", "bands", "global"];

function keyboardTab(event: KeyboardEvent<HTMLButtonElement>, choose: (index: number) => void) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>("button[role='tab']"));
  const index = buttons.indexOf(event.currentTarget);
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
    : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
  event.preventDefault(); choose(next); buttons[next]!.focus();
}

function FieldEditor({ field, disabled, id, labels, onChange }: {
  field: PlayerProfileFieldView; disabled: boolean; id: string; labels: PlayerProfileLabels;
  onChange: NonNullable<PlayerProfilePanelProps["onChange"]>;
}) {
  if (field.options) {
    const choices = field.options.filter(option => option.value !== null);
    const selected = choices.findIndex(option => option.value === field.value);
    return <select id={id} className="pp-value-input" aria-label={field.ariaLabel ?? field.label} disabled={disabled}
      value={field.value === null ? "unknown" : selected === -1 ? "current" : String(selected)} onChange={event => {
        if (event.target.value === "unknown") onChange(field.key, null);
        else onChange(field.key, choices[Number(event.target.value)]!.value);
      }}>
      <option value="unknown">{field.options.find(option => option.value === null)?.label ?? labels.unknown}</option>
      {field.value !== null && selected === -1 && <option value="current" disabled>{field.displayValue}</option>}
      {choices.map((option, index) => <option key={index} value={index}>{option.label}</option>)}
    </select>;
  }
  if (field.range) return <input id={id} className="pp-value-input" key={`${field.key}:${String(field.value)}`} type="number" inputMode="numeric"
    aria-label={field.ariaLabel ?? field.label} disabled={disabled} min={field.range.min} max={field.range.max} step={field.range.step}
    defaultValue={field.value ?? ""} placeholder={labels.unknown} onBlur={event => {
      const value = event.target.value;
      if (value !== String(field.value ?? "")) onChange(field.key, value === "" ? null : Number(value));
    }} />;
  return null;
}

function ProfileField({ field, labels, canEdit, busy, onChange, onPresenceChange, id }: {
  field: PlayerProfileFieldView; labels: PlayerProfileLabels; canEdit: boolean; busy: boolean; id: string;
  onChange: PlayerProfilePanelProps["onChange"]; onPresenceChange: PlayerProfilePanelProps["onPresenceChange"];
}) {
  const inputId = `${id}-value`;
  const editable = canEdit && !field.readOnly;
  const hasEditor = !!field.editor || !!onChange && (!!field.options || !!field.range);
  const hasPresenceEditor = editable && !!onPresenceChange;
  const levelUnavailable = field.presence?.value === "not-owned";
  return <div className={`pp-field${field.needsReview ? " pp-field-review" : ""}`} data-field-key={field.key}>
    <div className="pp-field-heading"><label htmlFor={editable && hasEditor && !field.editor ? inputId : undefined}>{field.label}</label>
      {field.statusLabel && <small className="pp-source">{field.statusLabel}</small>}
    </div>
    {field.presence && <div className="pp-presence">
      {hasPresenceEditor ? <select className="pp-presence-input" aria-label={`${field.ariaLabel ?? field.label} · ${field.presence.label}`} disabled={busy}
        value={field.presence.value ?? "unknown"} onChange={event => onPresenceChange!(field.key,
          event.target.value === "unknown" ? null : event.target.value as "owned" | "not-owned")}>
        <option value="unknown">{labels.unknown}</option><option value="owned">{labels.owned}</option><option value="not-owned">{labels.notOwned}</option>
      </select> : <span className="pp-presence-label" data-presence={field.presence.value ?? "unknown"}>{field.presence.label}</span>}
    </div>}
    <div className="pp-value-shell" data-value-state={field.derived ? "derived" : field.value === null ? "unknown" : "known"}>
      {editable && hasEditor ? field.editor ?? <FieldEditor field={field} id={inputId} labels={labels}
        disabled={busy || levelUnavailable} onChange={onChange!} /> : <strong className="pp-value">{field.displayValue}</strong>}
    </div>
    {field.needsReview && <p className="pp-review-note">{labels.review}</p>}
    {field.description && <p className="pp-field-description">{field.description}</p>}
    {!!field.history?.length && <details className="pp-history"><summary>{labels.history}</summary><ul>{field.history.map(entry => <li key={entry.id}>
      <strong>{entry.valueLabel}</strong><span>{entry.sourceLabel}</span><time>{entry.atLabel}</time>{entry.versionLabel && <small>{entry.versionLabel}</small>}
    </li>)}</ul></details>}
  </div>;
}

/** Small source PNGs and HTML controls only. Catalogue binding and persistence belong to the caller. */
export default function PlayerProfilePanel({ server, currentCatalog, mode, busy, groups, labels, showTitle = true, onChange, onPresenceChange, footer }: PlayerProfilePanelProps) {
  const id = useId();
  const [section, setSection] = useState<Section>("characters");
  const [selectedGroups, setSelectedGroups] = useState<Partial<Record<Section, string>>>({});
  const bound = currentCatalog?.server === server;
  const available = sections.filter(value => groups.some(group => group.section === value));
  const activeSection = available.includes(section) ? section : available[0];
  const visibleGroups = groups.filter(group => group.section === activeSection);
  const activeGroup = visibleGroups.find(group => group.id === selectedGroups[activeSection!]) ?? visibleGroups[0];
  const canEdit = mode === "edit" && bound;
  const groupStyle: ProfileStyle = { "--pp-band-color": activeGroup?.color };
  const footerContent = typeof footer === "function" ? footer(activeSection) : footer;

  return <section className="pp-profile" data-profile-mode={mode} data-profile-server={server} aria-labelledby={`${id}-title`}>
    <header className="pp-header"><div><h2 id={`${id}-title`} className={showTitle ? undefined : "sr-only"}>{labels.title}</h2><p>{labels.description}</p></div>
      {bound && <span className="pp-catalog-version">{labels.catalogVersion}</span>}
    </header>
    {!bound || !available.length ? <p className="pp-unavailable" role="status">{labels.unavailable}</p> : <>
      <div className="pp-section-tabs" role="tablist" aria-label={labels.title}>{available.map(value => <button type="button" role="tab" key={value}
        id={`${id}-tab-${value}`} aria-controls={`${id}-panel`} aria-selected={activeSection === value} tabIndex={activeSection === value ? 0 : -1}
        onClick={() => setSection(value)} onKeyDown={event => keyboardTab(event, index => setSection(available[index]!))}>{labels[value]}</button>)}</div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${activeSection}`} className={`pp-section pp-section-${activeSection}`}>
        {visibleGroups.length > 1 && <div className="pp-band-tabs" role="tablist" aria-label={labels[activeSection!]}>{visibleGroups.map(group => <button type="button" role="tab"
          key={group.id} aria-controls={`${id}-group`} id={`${id}-group-tab-${group.id}`} aria-selected={activeGroup?.id === group.id} tabIndex={activeGroup?.id === group.id ? 0 : -1}
          style={{ "--pp-band-color": group.color } as ProfileStyle} onClick={() => setSelectedGroups(previous => ({ ...previous, [activeSection!]: group.id }))}
          onKeyDown={event => keyboardTab(event, index => setSelectedGroups(previous => ({ ...previous, [activeSection!]: visibleGroups[index]!.id })))}>
          {group.image && <img src={group.image.src} alt={group.image.alt} crossOrigin="anonymous" loading="lazy" decoding="async" />}<span>{group.title}</span>
        </button>)}</div>}
        {activeGroup && <div id={`${id}-group`} className="pp-group" role={visibleGroups.length > 1 ? "tabpanel" : undefined}
          aria-labelledby={visibleGroups.length > 1 ? `${id}-group-tab-${activeGroup.id}` : undefined} style={groupStyle}>
          <div className="pp-group-heading">{activeGroup.image && <img src={activeGroup.image.src} alt={activeGroup.image.alt} crossOrigin="anonymous" loading="lazy" decoding="async" />}<h3>{activeGroup.title}</h3></div>
          {activeGroup.description && <p className="pp-group-description">{activeGroup.description}</p>}
          {!!activeGroup.summaryFields?.length && <details className="pp-group-summary"><summary>{activeGroup.summaryLabel ?? activeGroup.title}</summary>
            <div className="pp-summary-fields">{activeGroup.summaryFields.map((field, index) => <ProfileField key={field.key} field={field} labels={labels}
              canEdit={canEdit} busy={busy} onChange={onChange} onPresenceChange={onPresenceChange} id={`${id}-${activeGroup.id}-summary-${index}`} />)}</div>
          </details>}
          <div className="pp-entities">{activeGroup.entities.map(entity => <article className="pp-entity" key={entity.id} data-entity-id={entity.id}>
            <header className="pp-entity-heading">{entity.image && <div className="pp-entity-image">
              {activeSection === "characters" && entity.rankBadge ? <CharacterRankArtwork src={entity.image.src} name={entity.title} value={entity.rankBadge.valueLabel} label={entity.rankBadge.label} /> : <img src={entity.image.src} alt={entity.image.alt} crossOrigin="anonymous" loading="lazy" decoding="async" />}
            </div>}<h4>{entity.title}</h4></header>
            <div className="pp-entity-fields">{entity.fields.map((field, index) => <ProfileField key={field.key} field={field} labels={labels} canEdit={canEdit}
              busy={busy} onChange={onChange} onPresenceChange={onPresenceChange} id={`${id}-${entity.id}-${index}`} />)}</div>
          </article>)}</div>
        </div>}
      </div>
    </>}
    {footerContent && <div className="pp-footer">{footerContent}</div>}
  </section>;
}

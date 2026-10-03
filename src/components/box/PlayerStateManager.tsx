import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import type { CardBox } from "@/lib/box/model";
import { playerProfileGroups } from "@/lib/box/player-profile-data";
import { answerFurnitureLevel, answerFurnitureOwnership, answerPlayerEvents, answerPlayerField, answerPlayerMemory, validatePlayerCatalogue, type PlayerFieldCatalogue } from "@/lib/box/player-catalog";
import PlayerProfilePanel from "./PlayerProfilePanel";

export default function PlayerStateManager({ locale, box, catalogue, busy, commit, mode, embedded = false }: {
  locale: AppLocale; box: CardBox; catalogue?: PlayerFieldCatalogue | null; busy: boolean; commit: (next: CardBox) => Promise<boolean>;
  mode?: "read-only" | "edit";
  embedded?: boolean;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.${key}`, values);
  const pp = (key: string, values?: Record<string, string | number>) => tr(`profile.${key}`, values);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState(false);
  const assetUrl = useAssetUrl();
  const currentMode = mode ?? (preview ? "read-only" : "edit");
  let valid = false;
  if (catalogue) { try { validatePlayerCatalogue(catalogue); valid = catalogue.server === box.server; } catch { /* Catalogue binding owns the input domain. */ } }
  async function save(next: CardBox) { setError(!await commit(next)); }
  async function answer(key: string, value: number | string | null) {
    if (!catalogue || !valid || busy || currentMode === "read-only") return;
    try {
      if (key === "memory") await save(answerPlayerMemory(box, catalogue, value === "none" ? { musicRanks: {}, unlockedMembers: [], unlockedSnaps: [] } : null));
      else {
        const entry = catalogue.fields.find(field => field.key === key);
        await save(entry?.kind === "band-item" ? answerFurnitureLevel(box, catalogue, key, value as number | null) : answerPlayerField(box, catalogue, key, value));
      }
    } catch { setError(true); }
  }
  async function presence(key: string, value: "owned" | "not-owned" | null) {
    if (!catalogue || !valid || busy || currentMode === "read-only") return;
    try { await save(answerFurnitureOwnership(box, catalogue, key, value)); } catch { setError(true); }
  }
  async function events(value: string[] | null) {
    if (!catalogue || !valid || busy || currentMode === "read-only") return;
    try { await save(answerPlayerEvents(box, catalogue, value)); } catch { setError(true); }
  }
  const groups = valid && catalogue ? playerProfileGroups(box, catalogue, locale, assetUrl) : [];
  const eventField = groups.find(group => group.section === "global")?.entities.find(entity => entity.id === "eventIds")?.fields[0];
  if (eventField && catalogue?.profile?.events && currentMode === "edit") eventField.editor = <div className="pp-events-editor">
    <div className="pp-events-actions"><button type="button" disabled={busy} aria-pressed={box.player.eventIds.value?.length === 0} onClick={() => void events([])}>{pp("eventsOff")}</button>
      <button type="button" disabled={busy} onClick={() => void events(null)}>{pp("clearRecord")}</button></div>
    {catalogue.profile.events.choices.map(event => <label key={event.id}><input type="checkbox" disabled={busy} checked={box.player.eventIds.value?.includes(event.id) ?? false}
      onChange={change => void events(change.target.checked ? [...(box.player.eventIds.value ?? []), event.id] : (box.player.eventIds.value ?? []).filter(id => id !== event.id))} />{localizeMasterText(event.label, locale)}</label>)}
  </div>;
  return <PlayerProfilePanel server={box.server} currentCatalog={valid && catalogue ? catalogue : null} mode={currentMode} busy={busy} groups={groups}
    showTitle={!embedded} labels={{ title: pp("title"), description: `${tr("collection.manualGrowth")} · ${pp("description")}`, characters: pp("characters"), bands: pp("bands"), global: pp("global"), unknown: tr("unknown"), owned: tr("bandItemStates.owned"), notOwned: tr("bandItemStates.not-owned"), history: pp("history"), review: tr("chooseObservation"), unavailable: tr("playerCatalogUnavailable"), catalogVersion: t(locale, `account.games.servers.${box.server}`) }}
    onChange={(key, value) => void answer(key, value)} onPresenceChange={(key, value) => void presence(key, value)} footer={section => <>
      {error && <p className="dw-alert" role="alert">{tr("playerValueError")}</p>}
      {valid && currentMode === "edit" && <>
        {section === "bands" && <label><input type="checkbox" disabled={busy} checked={box.player.bandItemsComplete} onChange={event => void save({ ...box, player: { ...box.player, bandItemsComplete: event.target.checked } })} />{tr("furnitureCoverage")}</label>}
        {section === "characters" && <label><input type="checkbox" disabled={busy} checked={box.player.characterCoverage === "complete"} onChange={event => void save({ ...box, player: { ...box.player, characterCoverage: event.target.checked ? "complete" : "partial" } })} />{tr("characterRankCoverage")}</label>}
      </>}
      {!mode && <button type="button" disabled={busy} onClick={() => { setPreview(value => !value); setError(false); }}>{pp(preview ? "edit" : "preview")}</button>}
    </>} />;
}

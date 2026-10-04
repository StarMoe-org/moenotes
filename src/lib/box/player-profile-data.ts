import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getAssetUrl } from "@/lib/assets/url";
import { getBandLogoUrl } from "@/lib/cards/assets";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { CardBox } from "./model";
import { exportPlayerContexts, exportPlayerRankFacts, playerField, type PlayerCatalogueField, type PlayerFieldCatalogue } from "./player-catalog";
import type { PlayerProfileFieldView, PlayerProfileGroupView } from "./player-profile-view";

/**
 * Same display projection in editing and profile mode; no default cultivation is created. With `gameSave`, character
 * ranks, furniture and memory are read from a linked save: shown read-only with the save as their source.
 */
export function playerProfileGroups(box: CardBox, catalogue: PlayerFieldCatalogue, locale: AppLocale, assetUrl: (url: string) => string, options: { gameSave?: boolean } = {}): PlayerProfileGroupView[] {
  if (box.server !== catalogue.server) throw new Error("Player catalogue belongs to another server");
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.${key}`, values);
  const pp = (key: string, values?: Record<string, string | number>) => tr(`profile.${key}`, values);
  const meta = catalogue.profile;
  const fromSave = (field: PlayerProfileFieldView): PlayerProfileFieldView => options.gameSave ? { ...field, readOnly: true, statusLabel: tr("gameSave.fieldSource") } : field;
  const history = (field: ReturnType<typeof playerField>) => field.history.map(item => ({ id: item.id, valueLabel: item.value === null ? tr("unknown") : String(item.value), sourceLabel: tr(item.source), atLabel: new Date(item.at).toLocaleString(locale), versionLabel: item.catalog?.masterVersion }));
  function view(entry: PlayerCatalogueField, label: string, ariaLabel = label): PlayerProfileFieldView {
    const field = playerField(box, entry);
    const current = field.history.some(item => item.value === field.value && item.catalog?.sha256 === catalogue.sha256 && item.catalog.masterVersion === catalogue.masterVersion && item.catalog.fieldKey === entry.key);
    const levels = entry.levels;
    const contiguous = levels && levels.every((value, index) => value === levels[0]! + index);
    const range = !entry.options && contiguous && levels.length > 12 ? { min: levels[0]!, max: levels.at(-1)!, step: 1 }
      : !entry.options && !levels && entry.min !== undefined && entry.max !== undefined ? { min: entry.min, max: entry.max, step: 1 } : undefined;
    const options = !range && (entry.options || levels) ? [{ value: null, label: tr("unknown") }, ...(entry.options?.map(option => ({ value: option.value, label: localizeMasterText(option.label, locale) || String(option.value) })) ?? levels!.map(value => ({ value, label: String(value) })))] : undefined;
    return { key: entry.key, label, ariaLabel, value: field.value, displayValue: field.value === null ? tr("unknown") : String(field.value), options, range,
      statusLabel: field.value !== null && !current ? pp("oldRecord") : field.history.length ? tr(field.status) : "", needsReview: field.needsReview, history: history(field) };
  }
  const ranks = exportPlayerRankFacts(box, catalogue);
  const total = ranks.characterRanks.coverage === "complete" ? ranks.characterRanks.values.reduce((sum, row) => sum + row.value, 0) : null;
  const groups: PlayerProfileGroupView[] = [];
  for (const band of meta?.bands ?? []) {
    const bandName = localizeMasterText(band.label, locale);
    const image = { src: assetUrl(getBandLogoUrl(band.id, locale)), alt: bandName };
    const characters = meta!.characters.filter(character => character.bandId === band.id);
    groups.push({ id: `characters.${band.id}`, section: "characters", title: bandName, color: band.color, image, description: pp("characterEffect"),
      entities: characters.map(character => {
        const name = localizeMasterText(character.label, locale);
        const entry = catalogue.fields.find(field => field.kind === "character-rank" && field.id === character.id)!;
        return { id: character.id, title: name, rankBadge: { label: pp("rankBadge"), valueLabel: playerField(box, entry).value === null ? "—" : String(playerField(box, entry).value) }, image: { src: assetUrl(getAssetUrl({ path: `Character/Image/${character.id}/character_round_icon.png` })), alt: name },
          fields: [fromSave(view(entry, pp("characterLevel"), `${name} · ${pp("characterLevel")}`))] };
      }) });
    const summaryFields = (meta?.fields ?? []).filter(entry => entry.targets?.bandIds?.includes(band.id)).map(entry => {
      const attribute = entry.targets?.attributes?.[0];
      return { ...view(entry, attribute ? pp("bandTypeRank", { type: t(locale, `cards.attributes.${attribute}`) }) : pp("bandRank")), description: entry.key.startsWith("profile.bandRank.") ? pp("bandRankDescription") : undefined };
    });
    groups.push({ id: `items.${band.id}`, section: "bands", title: bandName, color: band.color, image, description: pp("furnitureEffect", { band: bandName }), summaryLabel: pp("profileSummary"), summaryFields,
      entities: catalogue.fields.filter(entry => entry.kind === "band-item" && entry.targets?.bandIds?.includes(band.id)).map(entry => {
        const name = localizeMasterText(entry.label, locale);
        const field = view(entry, pp("furnitureLevel"), `${name} · ${pp("furnitureLevel")}`);
        const presence = box.player.bandItemStates[entry.id!];
        const ownership = presence?.value === "owned" ? "owned" : presence?.value === "not-owned" ? "not-owned" : null;
        field.presence = { value: ownership, label: ownership ? tr(`bandItemStates.${ownership}`) : tr("unknown") };
        if (ownership === "not-owned") field.displayValue = tr("bandItemStates.not-owned");
        return { id: entry.id!, title: name, image: { src: assetUrl(getAssetUrl({ path: `Band/${band.id}/BandItem/${entry.id}/band_item.png` })), alt: name }, fields: [fromSave(field)] };
      }) });
  }
  const globals = catalogue.fields.filter(entry => ["character-total-rank", "vip-rank"].includes(entry.kind)).map(entry => {
    const label = tr(entry.kind === "character-total-rank" ? "characterTotalRankLabel" : "vipRankLabel");
    const field = view(entry, label);
    if (entry.kind === "character-total-rank") {
      field.description = total === null ? pp("totalDescription") : pp("totalDerived", { count: ranks.characterRanks.values.length, value: total });
      if (total !== null && ranks.characterTotalRank !== null && total !== ranks.characterTotalRank) { field.needsReview = true; field.description += ` ${pp("totalConflict")}`; }
      if (field.value === null && total !== null) { field.displayValue = String(total); field.statusLabel = pp("totalSource"); }
      return { id: entry.key, title: label, fields: [options.gameSave ? { ...fromSave(field), statusLabel: pp("totalSource") } : field] };
    }
    field.description = options.gameSave ? `${pp("vipDescription")} ${tr("gameSave.vipNote")}` : pp("vipDescription");
    return { id: entry.key, title: label, fields: [field] };
  });
  const player = meta?.fields.find(entry => entry.key === "profile.playerRank");
  if (player) globals.push({ id: player.key, title: pp("playerRank"), fields: [{ ...view(player, pp("playerRank")), description: pp("playerRankDescription") }] });
  const context = exportPlayerContexts(box, catalogue);
  if (meta?.memory) {
    const memory = box.player.memory;
    const empty = memory.value && !Object.keys(memory.value.musicRanks).length && !memory.value.unlockedMembers.length && !memory.value.unlockedSnaps.length;
    globals.push({ id: "memory", title: pp("memory"), fields: [fromSave({ key: "memory", label: pp("memory"), value: empty ? "none" : memory.value ? "progress" : null,
      displayValue: empty ? pp("memoryNone") : memory.value ? pp("memoryProgress", { music: Object.keys(memory.value.musicRanks).length, members: memory.value.unlockedMembers.length, snaps: memory.value.unlockedSnaps.length }) : tr("unknown"),
      statusLabel: memory.value && !context.memory ? pp("oldRecord") : tr(memory.status), needsReview: memory.needsReview,
      description: meta.memory.hasEffects ? undefined : pp("memoryEmpty"),
      options: [{ value: null, label: tr("unknown") }, { value: "none", label: pp("memoryNone") }],
      history: memory.history.map(item => ({ id: item.id, valueLabel: item.value ? pp("memoryProgress", { music: Object.keys(item.value.musicRanks).length, members: item.value.unlockedMembers.length, snaps: item.value.unlockedSnaps.length }) : tr("unknown"), sourceLabel: tr(item.source), atLabel: new Date(item.at).toLocaleString(locale), versionLabel: item.catalog?.masterVersion })) })] });
  }
  if (meta?.events) {
    const events = box.player.eventIds;
    const eventNames = (ids: readonly string[]) => ids.map(id => localizeMasterText(meta.events!.choices.find(choice => choice.id === id)?.label, locale) || id).join(" · ");
    globals.push({ id: "eventIds", title: pp("events"), fields: [{ key: "eventIds", label: pp("events"), value: events.value === null ? null : events.value.length ? events.value.join("|") : "none",
      displayValue: events.value === null ? tr("unknown") : events.value.length ? eventNames(events.value) : pp("eventsOff"), statusLabel: events.value && !context.eventIds ? pp("oldRecord") : tr(events.status), needsReview: events.needsReview,
      description: meta.events.choices.length ? pp("eventsDescription") : pp("eventsEmpty"),
      history: events.history.map(item => ({ id: item.id, valueLabel: item.value === null ? tr("unknown") : item.value.length ? eventNames(item.value) : pp("eventsOff"), sourceLabel: tr(item.source), atLabel: new Date(item.at).toLocaleString(locale), versionLabel: item.catalog?.masterVersion })) }] });
  }
  groups.push({ id: "global", section: "global", title: pp("global"), entities: globals });
  return groups;
}

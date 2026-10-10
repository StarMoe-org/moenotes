import type { AppLocale } from "@/config/locales";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import { buildSnapSkillCatalogue, snapChoiceKey, snapMemberContext, snapRows } from "./snap-catalogue";
import { buildSnapLabeler, buildSnapReferenceCards, type SnapLabelSource } from "./snap-labels";
import { localizeDataText } from "./text";
import type { DataText, MusicData } from "./types";
import type { SnapDeckData, SnapSkillChoice } from "./snap-types";

interface SourceCharacter { id: number; name?: DataText | null; bandId?: number; mainColor?: string }
interface SourceMeta extends MusicData { characters?: readonly SourceCharacter[] }
export interface SnapSourceMember { id: number; name: string; vm?: CardViewModel; gkLevels: number[] }

function assertSourceMusic(data: SnapDeckData, music: MusicData) {
  const master = data.provenance.master as { version?: string } | undefined, model = data.provenance.deck as { commit?: string } | undefined;
  if (!["nnnotes.music-data/1", "nnnotes.music-data/2"].includes(music.format ?? "") || music.provenance?.region !== data.provenance.region || music.provenance?.master?.version !== master?.version || music.provenance?.deck?.commit !== model?.commit) throw new Error("Display catalog belongs to another replay snapshot");
}
const number = (value: unknown, fallback = 0): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const text = (value: unknown): string => typeof value === "string" ? value : "";

/** Same-source reference labels only. Missing artwork IDs stay missing; never infer them from card IDs. */
export function buildSnapSourceCards(data: SnapDeckData, sourceMusicData: MusicData, labelSource: SnapLabelSource | undefined, locale: AppLocale) {
  assertSourceMusic(data, sourceMusicData);
  const source = sourceMusicData as SourceMeta;
  const full = labelSource ? buildSnapReferenceCards(data, labelSource, locale) : undefined;
  const fullMembers = new Map(full?.members.map((card) => [card.id, card]) ?? []);
  const snaps = new Map<number, SupportCardViewModel>(full?.snaps.map((card) => [card.id, card]) ?? []);
  const sourceMembers = new Map(source.gekisouCatalog?.members?.map((m) => [m.id, m]) ?? []);
  const sourceSnaps = new Map(source.gekisouCatalog?.snaps?.map((s) => [s.id, s]) ?? []);
  const characters = new Map(source.characters?.map((c) => [c.id, c]) ?? []);
  const bands = new Map(source.bands?.map((b) => [b.id, b]) ?? []);
  const nativeCharacters = new Map(snapRows(data, "MasterCharacter").map((c) => [number(c._id), c]));
  const gkEffects = snapRows(data, "MasterGekisouSkillEffect");
  const members: SnapSourceMember[] = snapRows(data, "MasterMemberCard").map((row) => {
    const id = number(row._id), named = sourceMembers.get(id), existing = fullMembers.get(id);
    const name = (existing ? [existing.characterName, existing.title].filter(Boolean).join(" ") : "") || localizeDataText(named?.name, locale) || String(id);
    const gkLevels = [...new Set(gkEffects.filter((e) => e._gekisouSkillID === row._gekisouSkillID).map((e) => number(e._level)))].filter((n) => n > 0).sort((a, b) => a - b);
    let vm = existing;
    // Current normalized exports omit _assetID. Future additive columns can supply it without a global lookup.
    if (!vm && Number.isSafeInteger(row._assetID) && number(row._assetID) > 0 && [2, 3, 4, 20].includes(number(row._rarity)) && [1, 2, 3, 4, 5].includes(number(row._cardType))) {
      const characterId = number(row._characterID), character = characters.get(characterId), bandId = number(nativeCharacters.get(characterId)?._bandID), band = bands.get(bandId);
      vm = { id, assetId: number(row._assetID), characterId, bandId, rarity: number(row._rarity) as 2 | 3 | 4 | 20, cardType: number(row._cardType) as 1 | 2 | 3 | 4 | 5, title: localizeDataText(named?.subtitle, locale) || name,
        characterName: localizeDataText(character?.name, locale), bandName: localizeDataText(band?.name, locale), characterColor: character?.mainColor ?? "",
        performancePower: number(row._performancePowerMax), technicPower: number(row._technicPowerMax), visualPower: number(row._visualPowerMax), totalPower: number(row._performancePowerMax) + number(row._technicPowerMax) + number(row._visualPowerMax),
        startAt: text(row._startAt), gachaVoice: "", liveSkillId: number(row._liveSkillID), leaderSkillId: number(row._leaderSkillID), gekisouSkillId: number(row._gekisouSkillID), searchText: `${id} ${name}`.toLowerCase() };
    }
    return { id, name, gkLevels, ...(vm ? { vm } : {}) };
  });
  if (!full) for (const row of snapRows(data, "MasterSupportCard")) {
    const id = number(row._id);
    if (!Number.isSafeInteger(row._assetID) || number(row._assetID) <= 0 || ![2, 3, 4, 10].includes(number(row._rarity)) || ![1, 2, 3, 4, 5].includes(number(row._cardType))) continue;
    const named = sourceSnaps.get(id), characterIds = Array.isArray(row._characterIDs) ? row._characterIDs.map((x) => number(x)) : [];
    const bandId = number(nativeCharacters.get(characterIds[0] ?? 0)?._bandID);
    const name = localizeDataText(named?.name, locale) || String(id), title = localizeDataText(named?.subtitle, locale);
    snaps.set(id, { id, assetId: number(row._assetID), rarity: number(row._rarity) as 2 | 3 | 4 | 10, cardType: number(row._cardType) as 1 | 2 | 3 | 4 | 5, title, name, diaryText: "", characterIds,
      characters: characterIds.map((charId) => ({ id: charId, name: localizeDataText(characters.get(charId)?.name, locale), color: characters.get(charId)?.mainColor ?? "" })), bandId, bandName: localizeDataText(bands.get(bandId)?.name, locale),
      performancePower: number(row._performancePowerMax), technicPower: number(row._technicPowerMax), visualPower: number(row._visualPowerMax), totalPower: number(row._performancePowerMax) + number(row._technicPowerMax) + number(row._visualPowerMax), startAt: text(row._startAt),
      supportSkillId01: number(row._supportSkillId01), supportSkillId02: number(row._supportSkillId02), gekisouSupportSkillId01: number(row._gekisouSupportSkillId01), gekisouSupportSkillId02: number(row._gekisouSupportSkillId02), searchText: `${id} ${name} ${title}`.toLowerCase() });
  }
  return { members, snaps, memberContext: (id: number, level: number | null) => snapMemberContext(data, id, level) };
}

/** Without label resources use only names from this music-data snapshot, never an unexpanded template. */
export function labelSnapRankingCatalogue(choices: SnapSkillChoice[], data: SnapDeckData, sourceMusicData: MusicData, labelSource: SnapLabelSource | undefined, locale: AppLocale): SnapSkillChoice[] {
  assertSourceMusic(data, sourceMusicData);
  if (labelSource) {
    const cards = new Map(buildSnapReferenceCards(data, labelSource, locale).snaps.map((card) => [card.id, card]));
    const localized = new Map(buildSnapSkillCatalogue(data, buildSnapLabeler(data, labelSource, locale)).map((choice) => [choice.key, choice]));
    return choices.map((choice) => {
      const resolved = { ...choice, ...localized.get(snapChoiceKey(choice.kind, choice.skillId, choice.level)) };
      const cardTerms = choice.cardIds.flatMap((id) => { const card = cards.get(id); return card ? [String(id), card.searchText, card.name, card.title, card.bandName, ...card.characters.map((character) => character.name)] : [String(id)]; });
      return { ...resolved, searchTerms: [...resolved.searchTerms, ...cardTerms].filter(Boolean) };
    });
  }
  const names = new Map(sourceMusicData.gekisouCatalog?.snaps?.map((card) => [card.id, localizeDataText(card.name, locale)]) ?? []);
  const titles = new Map(sourceMusicData.gekisouCatalog?.snaps?.map((card) => [card.id, localizeDataText(card.subtitle, locale)]) ?? []);
  const gkNames = new Map(sourceMusicData.gekisouCatalog?.supportSkills?.map((skill) => [skill.id, localizeDataText(skill.name, locale)]) ?? []);
  const characters = new Map((sourceMusicData as SourceMeta).characters?.map((character) => [character.id, character]) ?? []);
  const nativeCharacters = new Map(snapRows(data, "MasterCharacter").map((character) => [number(character._id), character]));
  const sourceCards = new Map(snapRows(data, "MasterSupportCard").map((card) => [number(card._id), card]));
  const bands = new Map(sourceMusicData.bands?.map((band) => [band.id, band]) ?? []);
  return choices.map((choice) => {
    const cards = choice.cardIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
    const name = (choice.kind === "gekisou-support" ? gkNames.get(choice.skillId) : cards[0]) || String(choice.skillId);
    const identityTerms = choice.cardIds.flatMap((id) => {
      const ids = sourceCards.get(id)?._characterIDs;
      return [titles.get(id) ?? "", ...(Array.isArray(ids) ? ids.flatMap((characterId) => { const character = characters.get(number(characterId)), band = bands.get(number(nativeCharacters.get(number(characterId))?._bandID)); return [localizeDataText(character?.name, locale), localizeDataText(band?.name, locale)]; }) : [])];
    });
    return { ...choice, name, description: "", searchTerms: [name, ...cards, ...identityTerms, String(choice.skillId), ...choice.cardIds.map(String)].filter(Boolean) };
  });
}

import type { DeckEvent } from "./goals";

export type ManualEventPerRank = readonly [number, number, number, number, number];

export interface DeckEventEffect {
  readonly resourceType: 2 | 3;
  readonly characterId: number;
  readonly bandId: number;
  readonly cardType: number;
  readonly tagId: 0;
  readonly memberCardId: number;
  readonly supportCardId: number;
  readonly bonusType: 0 | 1 | 2;
  readonly perRank: ManualEventPerRank;
}

export interface ManualBonusProfileRow {
  readonly resourceType: 2 | 3;
  readonly bonusType: 0 | 1 | 2;
  readonly perRank: ManualEventPerRank;
}

export interface ManualBonusTier {
  readonly key: string;
  readonly rows: readonly ManualBonusProfileRow[];
  readonly maxPointPercent: number;
  readonly maxItemPercent: number;
  readonly maxParamPercent: number;
}

export type ManualEventTargetKind = "band" | "character" | "none";

export interface ManualFeaturedCard {
  readonly cardId: number;
  readonly tierKey: string;
}

export interface ManualEventDraft {
  readonly templateEventId: number;
  readonly attributes: readonly number[];
  readonly targetKind: ManualEventTargetKind;
  readonly targets: readonly number[];
  readonly featuredMembers: readonly ManualFeaturedCard[];
  readonly featuredSnaps: readonly ManualFeaturedCard[];
}

export interface ManualEventTemplate {
  readonly eventId: number;
  readonly attributeProfile: readonly ManualBonusProfileRow[];
  readonly targetProfile: readonly ManualBonusProfileRow[];
  readonly memberTiers: readonly ManualBonusTier[];
  readonly snapTiers: readonly ManualBonusTier[];
  readonly defaultDraft: ManualEventDraft;
}

const VALID_ATTRIBUTES = new Set([1, 2, 3, 4, 5]);

function isPerRank(value: unknown): value is ManualEventPerRank {
  return (
    Array.isArray(value)
    && value.length === 5
    && value.every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 1_000_000)
  );
}

export function isDeckEventEffect(value: unknown): value is DeckEventEffect {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    (row.resourceType === 2 || row.resourceType === 3)
    && (row.bonusType === 0 || row.bonusType === 1 || row.bonusType === 2)
    && typeof row.cardType === "number" && Number.isInteger(row.cardType) && row.cardType >= 0 && row.cardType <= 5
    && row.tagId === 0
    && typeof row.characterId === "number" && Number.isInteger(row.characterId) && row.characterId >= 0
    && typeof row.bandId === "number" && Number.isInteger(row.bandId) && row.bandId >= 0
    && typeof row.memberCardId === "number" && Number.isInteger(row.memberCardId) && row.memberCardId >= 0
    && typeof row.supportCardId === "number" && Number.isInteger(row.supportCardId) && row.supportCardId >= 0
    && isPerRank(row.perRank)
  );
}

function profileSignature(rows: readonly ManualBonusProfileRow[]): string {
  return [...rows]
    .sort((a, b) => a.resourceType - b.resourceType || a.bonusType - b.bonusType)
    .map((row) => `${row.resourceType}:${row.bonusType}:${row.perRank.join(",")}`)
    .join("|");
}

function toProfileRow(effect: DeckEventEffect): ManualBonusProfileRow {
  return {
    resourceType: effect.resourceType,
    bonusType: effect.bonusType,
    perRank: [
      effect.perRank[0],
      effect.perRank[1],
      effect.perRank[2],
      effect.perRank[3],
      effect.perRank[4],
    ],
  };
}

function summarizeTier(key: string, rows: readonly ManualBonusProfileRow[]): ManualBonusTier {
  const maxFor = (bonusType: 0 | 1 | 2): number => {
    const matched = rows.filter((row) => row.bonusType === bonusType);
    if (!matched.length) return 0;
    const bestBasis = Math.max(...matched.map((row) => row.perRank[4]));
    return Math.round(bestBasis) / 100;
  };
  return {
    key,
    rows: [...rows].sort((a, b) => a.resourceType - b.resourceType || a.bonusType - b.bonusType),
    maxPointPercent: maxFor(0),
    maxItemPercent: maxFor(1),
    maxParamPercent: maxFor(2),
  };
}

/**
 * Extracts reusable bonus profiles from a recorded `DeckEvent`'s `effects` table so players can simulate custom
 * attribute, band/character, and pickup card bonuses while reusing the template event's live reward payout tables.
 */
export function extractManualEventTemplate(event: DeckEvent): ManualEventTemplate | null {
  const effects = event.effects;
  if (!effects || !effects.length || effects.some((row) => !isDeckEventEffect(row))) return null;

  const byAttribute = new Map<number, ManualBonusProfileRow[]>();
  const byBand = new Map<number, ManualBonusProfileRow[]>();
  const byCharacter = new Map<number, ManualBonusProfileRow[]>();
  const byMember = new Map<number, ManualBonusProfileRow[]>();
  const bySnap = new Map<number, ManualBonusProfileRow[]>();

  for (const row of effects) {
    const profile = toProfileRow(row);
    if (row.memberCardId > 0 && row.resourceType === 2 && row.supportCardId === 0 && row.cardType === 0 && row.bandId === 0 && row.characterId === 0) {
      const list = byMember.get(row.memberCardId) ?? [];
      list.push(profile);
      byMember.set(row.memberCardId, list);
      continue;
    }
    if (row.supportCardId > 0 && row.resourceType === 3 && row.memberCardId === 0 && row.cardType === 0 && row.bandId === 0 && row.characterId === 0) {
      const list = bySnap.get(row.supportCardId) ?? [];
      list.push(profile);
      bySnap.set(row.supportCardId, list);
      continue;
    }
    if (VALID_ATTRIBUTES.has(row.cardType) && row.bandId === 0 && row.characterId === 0 && row.memberCardId === 0 && row.supportCardId === 0) {
      const list = byAttribute.get(row.cardType) ?? [];
      list.push(profile);
      byAttribute.set(row.cardType, list);
      continue;
    }
    if (row.bandId > 0 && row.characterId === 0 && row.cardType === 0 && row.memberCardId === 0 && row.supportCardId === 0) {
      const list = byBand.get(row.bandId) ?? [];
      list.push(profile);
      byBand.set(row.bandId, list);
      continue;
    }
    if (row.characterId > 0 && row.bandId === 0 && row.cardType === 0 && row.memberCardId === 0 && row.supportCardId === 0) {
      const list = byCharacter.get(row.characterId) ?? [];
      list.push(profile);
      byCharacter.set(row.characterId, list);
      continue;
    }
    return null;
  }

  if (byBand.size > 0 && byCharacter.size > 0) return null;

  const uniformProfile = (groups: Map<number, ManualBonusProfileRow[]>): readonly ManualBonusProfileRow[] | null => {
    if (!groups.size) return [];
    const entries = [...groups.values()];
    const firstSig = profileSignature(entries[0]!);
    if (entries.some((rows) => profileSignature(rows) !== firstSig)) return null;
    return [...entries[0]!].sort((a, b) => a.resourceType - b.resourceType || a.bonusType - b.bonusType);
  };

  const attributeProfile = uniformProfile(byAttribute);
  const targetMap = byBand.size > 0 ? byBand : byCharacter;
  const targetProfile = uniformProfile(targetMap);
  if (attributeProfile === null || targetProfile === null) return null;

  const extractTiers = (
    cards: Map<number, ManualBonusProfileRow[]>,
  ): { tiers: ManualBonusTier[]; featured: ManualFeaturedCard[] } => {
    const tierMap = new Map<string, ManualBonusTier>();
    const featured: ManualFeaturedCard[] = [];
    for (const [cardId, rows] of [...cards.entries()].sort((a, b) => a[0] - b[0])) {
      const key = profileSignature(rows);
      if (!tierMap.has(key)) tierMap.set(key, summarizeTier(key, rows));
      featured.push({ cardId, tierKey: key });
    }
    const tiers = [...tierMap.values()].sort(
      (a, b) => b.maxPointPercent - a.maxPointPercent || b.maxItemPercent - a.maxItemPercent || b.maxParamPercent - a.maxParamPercent,
    );
    return { tiers, featured };
  };

  const memberResult = extractTiers(byMember);
  const snapResult = extractTiers(bySnap);
  const defaultTargetKind: ManualEventTargetKind = byBand.size > 0 ? "band" : byCharacter.size > 0 ? "character" : "none";

  return {
    eventId: event.id,
    attributeProfile,
    targetProfile,
    memberTiers: memberResult.tiers,
    snapTiers: snapResult.tiers,
    defaultDraft: {
      templateEventId: event.id,
      attributes: [...byAttribute.keys()].sort((a, b) => a - b),
      targetKind: defaultTargetKind,
      targets: [...targetMap.keys()].sort((a, b) => a - b),
      featuredMembers: memberResult.featured,
      featuredSnaps: snapResult.featured,
    },
  };
}

/** Synthesizes `goal.eventEffects` rows from a validated template and user-customized targets/featured cards. */
export function buildManualEventEffects(template: ManualEventTemplate, draft: ManualEventDraft): DeckEventEffect[] {
  const out: DeckEventEffect[] = [];
  const attributes = [...new Set(draft.attributes.filter((id) => VALID_ATTRIBUTES.has(id)))].sort((a, b) => a - b);
  for (const cardType of attributes) {
    for (const row of template.attributeProfile) {
      out.push({
        resourceType: row.resourceType,
        characterId: 0,
        bandId: 0,
        cardType,
        tagId: 0,
        memberCardId: 0,
        supportCardId: 0,
        bonusType: row.bonusType,
        perRank: row.perRank,
      });
    }
  }

  if (draft.targetKind !== "none" && template.targetProfile.length > 0) {
    const targets = [...new Set(draft.targets.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
    for (const targetId of targets) {
      for (const row of template.targetProfile) {
        out.push({
          resourceType: row.resourceType,
          characterId: draft.targetKind === "character" ? targetId : 0,
          bandId: draft.targetKind === "band" ? targetId : 0,
          cardType: 0,
          tagId: 0,
          memberCardId: 0,
          supportCardId: 0,
          bonusType: row.bonusType,
          perRank: row.perRank,
        });
      }
    }
  }

  const seenMembers = new Set<number>();
  for (const featured of draft.featuredMembers) {
    if (!Number.isInteger(featured.cardId) || featured.cardId <= 0 || seenMembers.has(featured.cardId)) continue;
    const tier = template.memberTiers.find((entry) => entry.key === featured.tierKey) ?? template.memberTiers[0];
    if (!tier) continue;
    seenMembers.add(featured.cardId);
    for (const row of tier.rows) {
      out.push({
        resourceType: 2,
        characterId: 0,
        bandId: 0,
        cardType: 0,
        tagId: 0,
        memberCardId: featured.cardId,
        supportCardId: 0,
        bonusType: row.bonusType,
        perRank: row.perRank,
      });
    }
  }

  const seenSnaps = new Set<number>();
  for (const featured of draft.featuredSnaps) {
    if (!Number.isInteger(featured.cardId) || featured.cardId <= 0 || seenSnaps.has(featured.cardId)) continue;
    const tier = template.snapTiers.find((entry) => entry.key === featured.tierKey) ?? template.snapTiers[0];
    if (!tier) continue;
    seenSnaps.add(featured.cardId);
    for (const row of tier.rows) {
      out.push({
        resourceType: 3,
        characterId: 0,
        bandId: 0,
        cardType: 0,
        tagId: 0,
        memberCardId: 0,
        supportCardId: featured.cardId,
        bonusType: row.bonusType,
        perRank: row.perRank,
      });
    }
  }

  return out;
}

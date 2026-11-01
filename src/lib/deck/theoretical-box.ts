import type { GameServer } from "@/config/servers";
import type { GameSaveTables } from "@/lib/box/game-save";
import { createBox, type BoxCard, type BoxField, type BoxMemory, type BoxPlayer, type CardBox } from "@/lib/box/model";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

type CardRarity = CardViewModel["rarity"];

function manualField<T>(value: T, id: string): BoxField<T> {
  return {
    status: "manual",
    value,
    history: [{ id, value, source: "manual", at: 0 }],
    needsReview: false,
  };
}

function unknownNumberField(): BoxField<number> {
  return { status: "unknown", value: null, history: [], needsReview: false };
}

function knownValue<T>(field: BoxField<T> | undefined): T | null {
  return field && (field.status === "manual" || field.status === "observed") ? field.value : null;
}

export function maxMemberLevelForRarity(rarity: CardRarity, awake = 5): number {
  const stage = Math.min(5, Math.max(1, Math.trunc(awake)));
  if (rarity === 2) return 20 + stage * 10;
  if (rarity === 3) return 30 + stage * 10;
  return 40 + stage * 10;
}

export function maxSnapLevelForRarity(rarity: SupportCardViewModel["rarity"], rank = 5): number {
  const stage = Math.min(5, Math.max(1, Math.trunc(rank)));
  if (rarity === 2) return 20 + stage * 10;
  if (rarity === 3) return 30 + stage * 10;
  return 40 + stage * 10;
}

function clampToLevelTable(targetLevel: number, rows: readonly (readonly [number, number])[] | undefined): number {
  if (!rows || !rows.length) return targetLevel;
  const maxInTable = rows.reduce((best, [lvl]) => Math.max(best, lvl), 1);
  return Math.min(targetLevel, maxInTable);
}

/**
 * Builds an ephemeral, non-destructive full-catalog max-practice `CardBox` for theoretical formation planning.
 * Preserves any real player modifiers (`characterRanks`, `vipRank`, `bandItems`, `memory`) from `source`, while
 * filling unanswered baseline fields (`vipRank = 1`, `characterRank = 1`, empty memories, level-0 furniture) so
 * theoretical searches run immediately even before a Box is created.
 */
export function buildTheoreticalMaxBox(
  source: CardBox | null,
  server: GameServer,
  catalog: { readonly members: readonly CardViewModel[]; readonly snaps: readonly SupportCardViewModel[] },
  saveTables: GameSaveTables | null,
): CardBox {
  const base = createBox(server, "theoretical-max", 0);
  const memberRows = [...catalog.members]
    .filter((card) => !saveTables || String(card.id) in saveTables.members)
    .sort((a, b) => a.id - b.id);
  const snapRows = [...catalog.snaps]
    .filter((snap) => !saveTables || String(snap.id) in saveTables.snaps)
    .sort((a, b) => a.id - b.id);

  const memberCards: BoxCard[] = memberRows.map((member) => {
    const id = String(member.id);
    const group = saveTables?.members[id];
    const level = clampToLevelTable(
      maxMemberLevelForRarity(member.rarity, 5),
      group !== undefined ? saveTables?.memberLevels[String(group)] : undefined,
    );
    return {
      key: `theory-m-${id}`,
      kind: "member",
      identity: manualField(id, `theory-m-${id}-id`),
      candidates: [],
      fields: {
        level: manualField(level, `theory-m-${id}-lv`),
        awake: manualField(5, `theory-m-${id}-aw`),
        rank: manualField(5, `theory-m-${id}-rk`),
        liveSkillLevel: manualField(5, `theory-m-${id}-ls`),
        gekisouSkillLevel: manualField(5, `theory-m-${id}-gs`),
      },
    };
  });

  const snapCards: BoxCard[] = snapRows.map((snap) => {
    const id = String(snap.id);
    const group = saveTables?.snaps[id];
    const level = clampToLevelTable(
      maxSnapLevelForRarity(snap.rarity, 5),
      group !== undefined ? saveTables?.snapLevels[String(group)] : undefined,
    );
    return {
      key: `theory-s-${id}`,
      kind: "snap",
      identity: manualField(id, `theory-s-${id}-id`),
      candidates: [],
      fields: {
        level: manualField(level, `theory-s-${id}-lv`),
        awake: unknownNumberField(),
        rank: manualField(5, `theory-s-${id}-rk`),
        liveSkillLevel: unknownNumberField(),
        gekisouSkillLevel: unknownNumberField(),
      },
    };
  });

  const sourcePlayer = source && source.server === server ? source.player : null;
  const characterRanks: Record<string, BoxField<number>> = {};
  const allCharacterIds = new Set<string>([
    ...(saveTables?.characters ?? []),
    ...Object.keys(sourcePlayer?.characterRanks ?? {}),
  ]);
  for (const charId of allCharacterIds) {
    const existing = sourcePlayer?.characterRanks[charId];
    const rank = knownValue(existing);
    characterRanks[charId] = rank !== null && existing ? structuredClone(existing) : manualField(1, `theory-char-${charId}`);
  }

  const existingVip = knownValue(sourcePlayer?.vipRank);
  const vipRank = existingVip !== null && sourcePlayer?.vipRank
    ? structuredClone(sourcePlayer.vipRank)
    : manualField(1, "theory-vip");

  const existingMemory = knownValue(sourcePlayer?.memory);
  const defaultMemory: BoxMemory = { musicRanks: {}, unlockedMembers: [], unlockedSnaps: [] };
  const memory = existingMemory !== null && sourcePlayer?.memory
    ? structuredClone(sourcePlayer.memory)
    : manualField(defaultMemory, "theory-memory");

  const player: BoxPlayer = {
    characterRanks,
    characterCoverage: "complete",
    characterTotalRank: sourcePlayer ? structuredClone(sourcePlayer.characterTotalRank) : unknownNumberField(),
    vipRank,
    bandItems: sourcePlayer ? structuredClone(sourcePlayer.bandItems) : {},
    bandItemStates: sourcePlayer ? structuredClone(sourcePlayer.bandItemStates) : {},
    catalogFields: sourcePlayer ? structuredClone(sourcePlayer.catalogFields) : {},
    catalogIdentity: sourcePlayer?.catalogIdentity ?? null,
    bandItemsComplete: true,
    memory,
    eventIds: sourcePlayer ? structuredClone(sourcePlayer.eventIds) : { status: "unknown", value: null, history: [], needsReview: false },
  };

  return {
    ...base,
    coverage: {
      member: { complete: true, declaredAt: 0 },
      snap: { complete: true, declaredAt: 0 },
    },
    cards: [...memberCards, ...snapCards],
    player,
    save: null,
  };
}

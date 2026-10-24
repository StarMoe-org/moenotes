import type { AppLocale } from "@/config/locales";
import { haneokaUrl } from "@/config/site";
import { CARD_FIELDS, type BoxField, type CardBox } from "./model";

const HANEOKA_LOCALES: Partial<Record<AppLocale, string>> = {
  "zh-CN": "zh-CN", "zh-TW": "zh-TW", "ja-JP": "ja", "en-US": "en", "ko-KR": "ko",
};

export function haneokaTeamBuilderUrl(locale: AppLocale): string {
  return `${haneokaUrl}/${HANEOKA_LOCALES[locale] ?? "en"}/team-builder/`;
}

export type InventoryField<T> = Pick<BoxField<T>, "status" | "value" | "needsReview">;
type InventoryFields<T> = Record<string, InventoryField<T>>;
export interface HaneokaInventory {
  format: "moenotes.card-inventory/1";
  server: CardBox["server"];
  cards: { kind: CardBox["cards"][number]["kind"]; identity: InventoryField<string>; fields: InventoryFields<number> }[];
  player: {
    characterRanks: InventoryFields<number>; characterTotalRank: InventoryField<number>; vipRank: InventoryField<number>;
    bandItems: InventoryFields<number>; bandItemStates: InventoryFields<string>; catalogFields: InventoryFields<number | string>;
    memory: InventoryField<CardBox["player"]["memory"]["value"]>; eventIds: InventoryField<string[]>;
  };
}
function currentField<T>(field: BoxField<T>): InventoryField<T> {
  return { status: field.status, value: structuredClone(field.value), needsReview: field.needsReview };
}
function currentFields<T>(fields: Record<string, BoxField<T>>): InventoryFields<T> {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, currentField(field)]));
}

/** Export the displayed Box, including resolved save facts, without its private save link or observation history. */
export function createHaneokaInventory(box: CardBox): HaneokaInventory {
  return {
    format: "moenotes.card-inventory/1", server: box.server,
    cards: box.cards.map(card => ({
      kind: card.kind, identity: currentField(card.identity),
      fields: Object.fromEntries(CARD_FIELDS.map(name => [name, currentField(card.fields[name])])),
    })),
    player: {
      characterRanks: currentFields(box.player.characterRanks),
      characterTotalRank: currentField(box.player.characterTotalRank),
      vipRank: currentField(box.player.vipRank),
      bandItems: currentFields(box.player.bandItems),
      bandItemStates: currentFields(box.player.bandItemStates),
      catalogFields: currentFields(box.player.catalogFields),
      memory: currentField(box.player.memory),
      eventIds: currentField(box.player.eventIds),
    },
  };
}

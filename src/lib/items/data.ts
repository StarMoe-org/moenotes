import type { AppLocale } from "@/config/locales";
import { validateMasterTable, type RawText } from "@/lib/cards/data";

export interface RawItem {
  id: number;
  type: number;
  inventoryDisplayGroup: number;
  nameTextId: string;
  descriptionTextId: string;
  imagePath: string;
  orderNum: number;
  max: number;
  value: number;
  startAt: string;
  endAt: string;
  displayTargetIds: number[];
}

export interface ItemViewModel {
  id: number;
  type: number;
  group: number;
  name: string;
  desc: string;
  imagePath: string;
  orderNum: number;
  searchText: string;
}

export function normalizeItems(
  items: RawItem[],
  texts: RawText[],
  locale: AppLocale,
): ItemViewModel[] {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;

  return items
    .map((item) => {
      const name = resolveText(item.nameTextId);
      const desc = resolveText(item.descriptionTextId);

      return {
        id: item.id,
        type: item.type,
        group: item.inventoryDisplayGroup,
        name,
        desc,
        imagePath: item.imagePath,
        orderNum: item.orderNum,
        searchText: [name, desc, item.id].join(" ").toLocaleLowerCase(),
      };
    })
    .sort((a, b) => a.group - b.group || a.orderNum - b.orderNum || a.id - b.id);
}

function localizeMasterText(entry: RawText | undefined, locale: AppLocale): string {
  if (!entry) return "";
  if (locale === "zh-CN") return entry.simplifiedChinese || entry.traditionalChinese || entry.japanese || entry.english;
  if (locale === "en-US") return entry.english || entry.japanese;
  return entry.japanese || entry.english;
}

export { validateMasterTable };

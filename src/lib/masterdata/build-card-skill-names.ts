import type { AppLocale } from "@/config/locales";
import type { RawSkillDefinition } from "@/lib/cards/skills";
import { eachServer, memo, table, texts } from "@/lib/masterdata/build-core";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

/*
 * Skill names for the card lists' table view and skill sort: member cards show their live skill, support cards their
 * first support skill. Small (a few dozen rows), so the list pages carry them; the first server with a skill names it.
 */

export interface CardSkillNames {
  live: Record<string, string>;
  support: Record<string, string>;
}

export function getBuildCardSkillNames(locale: AppLocale): Promise<CardSkillNames> {
  return memo(`card-skill-names:${locale}`, async () => {
    const names: CardSkillNames = { live: {}, support: {} };
    const perServer = await eachServer((server) => Promise.all([
      table<RawSkillDefinition>("MasterLiveSkill.json", server).catch(() => ({ _allData: [] as RawSkillDefinition[] })),
      table<RawSkillDefinition>("MasterSupportSkill.json", server).catch(() => ({ _allData: [] as RawSkillDefinition[] })),
      texts(server),
    ]));
    for (const [, [live, support, textTable]] of perServer) {
      const textMap = new Map(textTable._allData.map((row) => [row.id, row]));
      for (const [target, rows] of [[names.live, live._allData], [names.support, support._allData]] as const) {
        for (const skill of rows) {
          const key = String(skill.id);
          if (target[key]) continue;
          const name = localizeMasterText(textMap.get(skill.nameTextID), locale);
          if (name) target[key] = name;
        }
      }
    }
    return names;
  });
}

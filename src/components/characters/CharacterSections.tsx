import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import LevelSwitch from "@/components/shared/LevelSwitch";
import RewardChip from "@/components/shared/RewardChip";
import { getCostumeIconUrl } from "@/lib/assets/costume";
import { getLive2DViewerHref } from "@/lib/live2d/models";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import type { CostumeViewModel, RankRewardGroup } from "@/lib/characters/data";
import type { RewardViewModel } from "@/lib/rewards/resources";

/** Sections of the character page below its profile (`?section=`). */
export const CHARACTER_SECTIONS = ["profile", "costumes", "voices", "bonds", "missions", "related"] as const;
export type CharacterSection = typeof CHARACTER_SECTIONS[number];

/** The page's section, mirrored in `?section=` (profile, the default, leaves it out). */
export function useCharacterSection(): [CharacterSection, (section: CharacterSection) => void] {
  const [section, setSection] = useState<CharacterSection>("profile");
  useEffect(() => {
    const requested = readQueryParam("section");
    if (requested && (CHARACTER_SECTIONS as readonly string[]).includes(requested)) setSection(requested as CharacterSection);
  }, []);
  const pick = (next: CharacterSection) => {
    setSection(next);
    replaceQueryParam("section", next === "profile" ? null : next);
  };
  return [section, pick];
}

export function CharacterSectionTabs({ locale, value, onChange }: { locale: AppLocale; value: CharacterSection; onChange: (section: CharacterSection) => void }) {
  return (
    <MdMuiProvider>
      <Tabs
        value={value}
        onChange={(_event: React.SyntheticEvent, next: CharacterSection) => onChange(next)}
        aria-label={t(locale, "characters.sections.label")}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ "& .MuiTab-root": { textTransform: "none", fontSize: 12, fontWeight: 700, minHeight: 40, px: 1.5 } }}
      >
        {CHARACTER_SECTIONS.map((section) => (
          <Tab key={section} value={section} label={t(locale, `characters.sections.${section}`)} />
        ))}
      </Tabs>
    </MdMuiProvider>
  );
}

export function Panel({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <MdMuiProvider>
      <Card variant="outlined" sx={{ overflow: "hidden" }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5, borderBottom: "1px solid var(--md-sys-color-outline-variant)", px: 3, py: 2 }}>
          <Typography component="h3" sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 20, sm: 24 }, color: "var(--md-sys-color-on-surface)" }}>
            {title}
          </Typography>
          {actions}
        </Box>
        <Box sx={{ p: { xs: 3, sm: 4 } }}>{children}</Box>
      </Card>
    </MdMuiProvider>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <MdMuiProvider>
      <Typography variant="body2" sx={{ py: 1, textAlign: "center", fontWeight: 500, color: "var(--md-sys-color-on-surface-variant)" }}>
        {text}
      </Typography>
    </MdMuiProvider>
  );
}

/** Rank rewards with a rank switch: the rewards handed out on reaching the chosen rank. */
export function RankRewardsPanel({ locale, title, groups }: { locale: AppLocale; title: string; groups: RankRewardGroup[] }) {
  const ranks = useMemo(() => groups.map((group) => group.rank), [groups]);
  const [rank, setRank] = useState<number>(ranks[0] ?? 0);
  const current = groups.find((group) => group.rank === rank) ?? groups[0];
  return (
    <Panel title={title}>
      {!current ? <Empty text={t(locale, "characters.rewards.empty")} /> : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <LevelSwitch label={t(locale, "characters.rewards.rank")} value={current.rank} options={ranks} onChange={setRank} variant="slider" />
          <ul className="flex flex-wrap gap-2">
            {current.rewards.map((reward, index) => (
              <li key={`${reward.kind}:${reward.id}:${index}`}><RewardChip locale={locale} reward={reward as RewardViewModel} /></li>
            ))}
          </ul>
        </Box>
      )}
    </Panel>
  );
}

function costumeModelId(costume: CostumeViewModel): string {
  return costume.live2dPath.split("/").filter(Boolean).at(-1) ?? "";
}

export function CostumesPanel({ locale, costumes }: { locale: AppLocale; costumes: CostumeViewModel[] }) {
  const assetUrl = useAssetUrl();
  // One card per costume group: the group carries the name and icon; its first model opens in the viewer.
  const groups = useMemo(() => {
    const seen = new Map<number, CostumeViewModel>();
    for (const costume of costumes) if (costume.iconPath && !seen.has(costume.groupId)) seen.set(costume.groupId, costume);
    return [...seen.values()];
  }, [costumes]);
  return (
    <Panel title={t(locale, "characters.sections.costumes")}>
      {groups.length === 0 ? <Empty text={t(locale, "characters.costumes.empty")} /> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {groups.map((costume) => {
            const modelId = costumeModelId(costume);
            const body = (
              <>
                <img className="mx-auto h-24 w-24 object-contain" src={assetUrl(getCostumeIconUrl(costume.iconPath, locale))} alt="" loading="lazy" />
                <span className="mt-2 block text-center text-xs font-bold text-[var(--md-sys-color-on-surface)]">{costume.name}</span>
              </>
            );
            return (
              <li key={costume.groupId}>
                {modelId
                  ? <a href={getLive2DViewerHref(locale, modelId)} title={t(locale, "characters.costumes.openViewer")} className="block rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] p-3 transition-colors hover:border-[var(--md-sys-color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]">{body}</a>
                  : <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] p-3">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

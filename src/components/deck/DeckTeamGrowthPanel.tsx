"use client";

import { useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import type { AppLocale } from "@/config/locales";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import type { DeckGrowthScenario, DeckTeamGrowthReport } from "@/lib/deck/haneoka/growth";
import { t } from "@/i18n";
import { MemberSquareArtwork, SupportSquareArtwork } from "@/components/shared/CardSquareArtwork";
import { Icon } from "@/components/shared/icons";
import { DeckSegmented } from "./DeckControls";

export interface DeckTeamGrowthPanelProps {
  locale: AppLocale;
  report: DeckTeamGrowthReport | null;
  loading: boolean;
  onEvaluate: () => void;
  memberById: ReadonlyMap<number, CardViewModel>;
  snapById: ReadonlyMap<number, SupportCardViewModel>;
}

function formatDelta(locale: AppLocale, value: number, fractionDigits = 1): string {
  const rounded = Math.abs(value - Math.round(value)) < 1e-6;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: rounded ? 0 : fractionDigits,
  }).format(value);
}

type GrowthCategoryFilter = "all" | "level" | "awake" | "rank" | "skill";

function scenarioCategory(action: DeckGrowthScenario["action"]): Exclude<GrowthCategoryFilter, "all"> | "full" {
  switch (action) {
    case "level":
    case "levelCap":
      return "level";
    case "awake":
    case "awakeCap":
      return "awake";
    case "rank":
    case "rankCap":
      return "rank";
    case "liveSkillLevel":
    case "liveSkillCap":
    case "gekisouSkillLevel":
    case "gekisouSkillCap":
      return "skill";
    case "full":
      return "full";
  }
}

function actionLabel(
  tr: (key: string, values?: Record<string, string | number>) => string,
  scenario: DeckGrowthScenario,
): string {
  const values = { from: scenario.from ?? "?", to: scenario.to ?? "?" };
  switch (scenario.action) {
    case "level":
      return tr("actionLevel", values);
    case "levelCap":
      return tr("actionLevelCap", values);
    case "awake":
      return tr("actionAwake", values);
    case "awakeCap":
      return tr("actionAwakeCap", values);
    case "rank":
      return tr("actionRank", values);
    case "rankCap":
      return tr("actionRankCap", values);
    case "liveSkillLevel":
      return tr("actionLiveSkill", values);
    case "liveSkillCap":
      return tr("actionLiveSkillCap", values);
    case "gekisouSkillLevel":
      return tr("actionGekisouSkill", values);
    case "gekisouSkillCap":
      return tr("actionGekisouSkillCap", values);
    case "full":
      return tr("actionFull");
  }
}

const DISPLAY_SLOT_FOR_ENGINE_SLOT = [3, 1, 2, 4, 5] as const;

export default function DeckTeamGrowthPanel({
  locale,
  report,
  loading,
  onEvaluate,
  memberById,
  snapById,
}: DeckTeamGrowthPanelProps) {
  const tr = (key: string, values?: Record<string, string | number>) =>
    t(locale, `deckWorkspace.growth.${key}`, values);
  const [scope, setScope] = useState<"step" | "cap" | "all">("step");
  const [category, setCategory] = useState<GrowthCategoryFilter>("all");

  const counts = useMemo(() => {
    if (!report) return null;
    let upgradable = 0;
    let capped = 0;
    let unknown = 0;
    for (const card of report.cards) {
      if (card.status === "upgradable") upgradable += 1;
      else if (card.status === "atCap") capped += 1;
      else unknown += 1;
    }
    return { upgradable, capped, unknown };
  }, [report]);

  const visibleScenarios = useMemo(() => {
    if (!report) return [];
    return report.scenarios.filter((scenario) => {
      const resolvedTarget = scenario.target ?? (scenario.action === "full" ? "full" : scenario.action.endsWith("Cap") ? "cap" : "step");
      if (scope === "step" && resolvedTarget !== "step" && scenario.action !== "levelCap") return false;
      if (scope === "cap" && resolvedTarget !== "cap") return false;
      if (category !== "all") {
        const cat = scenarioCategory(scenario.action);
        if (cat !== category) return false;
      }
      return scenario.primaryGain > 1e-6 || scenario.scoreGain > 1e-6 || scenario.powerGain > 0;
    });
  }, [report, scope, category]);

  return (
    <section className="mt-4 rounded-2xl border border-outline-variant/60 bg-surface-container-low p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-col gap-0.5">
          <h4 className="m-0 text-sm font-semibold text-on-surface">{tr("title")}</h4>
          {counts && report?.status === "ok" && (
            <p className="m-0 text-xs text-on-surface-variant">
              {tr("summaryCounts", counts)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {report?.status === "ok" && report.scenarios.length > 0 && (
            <DeckSegmented
              size="small"
              fullWidth={false}
              ariaLabel={tr("title")}
              value={scope}
              onChange={setScope}
              options={[
                { value: "step", label: tr("scopeStep") },
                { value: "cap", label: tr("scopeCap") },
                { value: "all", label: tr("scopeAll") },
              ]}
            />
          )}
          <Button
            variant="tonal"
            size="small"
            disabled={loading}
            onClick={onEvaluate}
            startIcon={<Icon name={report ? "refresh" : "arrowUp"} className="h-4 w-4" />}
          >
            {loading ? tr("evaluating") : report ? tr("recompute") : tr("evaluate")}
          </Button>
        </div>
      </div>

      {report?.status === "ok" && report.scenarios.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {(["all", "level", "awake", "rank", "skill"] as const).map((cat) => (
            <Chip
              key={cat}
              size="small"
              clickable
              color={category === cat ? "primary" : "default"}
              variant={category === cat ? "filled" : "outlined"}
              label={tr(`category${cat[0]!.toUpperCase()}${cat.slice(1)}`)}
              onClick={() => setCategory(cat)}
            />
          ))}
        </div>
      )}

      {report && report.status !== "ok" && (
        <p className="mt-2.5 mb-0 text-xs text-error">
          {report.message === "growth-unsupported-runtime" ? tr("unavailable") : (report.message ?? tr("unavailable"))}
        </p>
      )}

      {report?.status === "ok" && visibleScenarios.length === 0 && (
        <p className="mt-2.5 mb-0 text-xs text-on-surface-variant">
          {counts && counts.upgradable === 0 && counts.unknown === 0
            ? tr("emptyAllCapped")
            : tr("emptyNoGain")}
        </p>
      )}

      {report?.status === "ok" && visibleScenarios.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {visibleScenarios.slice(0, 18).map((scenario, idx) => {
            const member = scenario.kind === "member" ? memberById.get(scenario.cardId) : undefined;
            const snap = scenario.kind === "snap" ? snapById.get(scenario.cardId) : undefined;
            const title =
              scenario.kind === "member"
                ? `${member?.characterName ?? `#${scenario.cardId}`}${member?.title ? ` · ${member.title}` : ""}`
                : `${snap?.name ?? `#${scenario.cardId}`}${snap?.title ? ` · ${snap.title}` : ""}`;
            const showScoreSub =
              report.metricKind !== "score" && Math.abs(scenario.scoreGain) > 0.5;
            const showPowerSub =
              report.metricKind !== "power" && Math.abs(scenario.powerGain) > 0;

            return (
              <div
                key={`${scenario.slot}-${scenario.kind}-${scenario.cardId}-${scenario.action}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-on-surface-variant">
                    #{idx + 1}
                  </span>
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                    {member ? (
                      <MemberSquareArtwork card={member} locale={locale} className="dw-card-art" native={false} />
                    ) : snap ? (
                      <SupportSquareArtwork card={snap} locale={locale} className="dw-card-art" native={false} />
                    ) : (
                      <span className="dw-card-art dw-card-unknown">?</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-on-surface">{title}</span>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={
                          scenario.kind === "member" && scenario.slot === 0
                            ? tr("leaderBadge")
                            : tr("slotLabel", { n: DISPLAY_SLOT_FOR_ENGINE_SLOT[scenario.slot] ?? scenario.slot + 1 })
                        }
                      />
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-primary">
                      {actionLabel(tr, scenario)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end tabular-nums">
                  <span className="text-sm font-semibold text-primary">
                    {tr("gainPrimary", {
                      delta: formatDelta(
                        locale,
                        scenario.primaryGain > 1e-6 ? scenario.primaryGain : scenario.scoreGain,
                      ),
                    })}
                  </span>
                  {(showScoreSub || showPowerSub) && (
                    <span className="text-[11px] text-on-surface-variant">
                      {[
                        showScoreSub ? tr("gainScore", { delta: formatDelta(locale, scenario.scoreGain, 0) }) : null,
                        showPowerSub ? tr("gainPower", { delta: formatDelta(locale, scenario.powerGain, 0) }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

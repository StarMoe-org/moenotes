import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { ARENA_MISSION_TYPES, ARENA_MUSIC_TYPES, DEFAULT_SONG_RULES, type DeckArenaMissions } from "@/lib/deck/arena";
import { TIME_LIMIT_CHOICES, playsGekisou, readsAccuracy, solverGoalKind, type DeckGoalInput, type DeckSolverCapabilities } from "@/lib/deck/goals";
import { DeckNumberField, DeckSelect } from "./DeckControls";

/** Inputs that belong to the selected objective; the native engine resolves the declared play. */
export default function DeckGoalConditions({ locale, input, capabilities, onChange }: {
  locale: AppLocale; input: DeckGoalInput; capabilities: DeckSolverCapabilities | null;
  onChange: (patch: Partial<DeckGoalInput>) => void;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.conditions.${key}`, values);
  const trArena = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.arena.${key}`, values);
  const played = readsAccuracy(input);
  const kind = solverGoalKind(input);
  const gekiso = playsGekisou(input);
  const showSongRules = Boolean(capabilities?.songRules) && kind !== "power" && kind !== "arenaLive";
  const songRules = input.songRules ?? DEFAULT_SONG_RULES;
  const attributeLabel = (musicType: number) => {
    if (musicType === 0) return trArena("musicTypeSongDefault");
    if (musicType === 99) return trArena("musicTypeNone");
    return t(locale, `cards.attributes.${musicType}`);
  };
  const missionLabel = (mission: number) => {
    if (mission === 1) return trArena("missionCombo");
    if (mission === 2) return trArena("missionLuck");
    if (mission === 3) return trArena("missionAccuracy");
    return trArena("missionSongDefault");
  };
  function updateSongMission(index: 0 | 1 | 2, mission: number) {
    const missions: DeckArenaMissions = [
      index === 0 ? mission : songRules.missions[0],
      index === 1 ? mission : songRules.missions[1],
      index === 2 ? mission : songRules.missions[2],
    ];
    onChange({ songRules: { musicType: songRules.musicType, missions } });
  }
  return (
    <>
      {showSongRules && (
        <div className="dc-sub-stack">
          <DeckSelect
            label={trArena("musicTypeLabel")}
            value={songRules.musicType}
            onChange={(musicType) => onChange({ songRules: { musicType, missions: songRules.missions } })}
            options={ARENA_MUSIC_TYPES.map((type) => ({
              value: type,
              label: attributeLabel(type),
            }))}
          />
          {gekiso && (
            <div className="dc-arena-missions">
              {([0, 1, 2] as const).map((index) => (
                <DeckSelect
                  key={index}
                  label={trArena("missionSlotLabel", { n: index + 1 })}
                  value={songRules.missions[index]}
                  onChange={(mission) => updateSongMission(index, mission)}
                  options={ARENA_MISSION_TYPES.map((mission) => ({
                    value: mission,
                    label: missionLabel(mission),
                  }))}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {played && (
        <>
          <DeckSelect
            label={tr("play")}
            value={input.playMode}
            onChange={(playMode) => onChange({ playMode })}
            options={[
              { value: "accuracy" as const, label: tr("accuracy") },
              { value: "pattern" as const, label: tr("pattern"), disabled: !capabilities?.patternPlay },
            ]}
          />
          {input.playMode === "pattern" && (
            <div className="dc-sub-stack">
              <DeckNumberField
                label={tr("missEvery")}
                min={0}
                max={2147483647}
                step={1}
                inputMode="numeric"
                value={Number.isFinite(input.missEvery) ? input.missEvery : null}
                onChange={(next) => onChange({ missEvery: next === null ? NaN : next })}
              />
              <p className="dc-field-hint">{tr(input.missEvery === 0 ? "noMiss" : "missPattern", { n: input.missEvery })}</p>
              <p className="dc-field-hint">{tr("patternNote")}</p>
            </div>
          )}
        </>
      )}
      {input.goal === "eventItems" && <p className="dc-field-hint">{tr("eventItemsNote")}</p>}
      <div className="dc-sub-stack">
        <DeckSelect
          label={tr("timeLimit")}
          value={input.timeLimit === null ? "none" : String(input.timeLimit)}
          onChange={(raw) => onChange({ timeLimit: raw === "none" ? null : (Number(raw) as DeckGoalInput["timeLimit"]) })}
          options={TIME_LIMIT_CHOICES.map((seconds) => ({
            value: seconds === null ? "none" : String(seconds),
            label: tr(`timeLimits.${seconds === null ? "none" : seconds}`),
          }))}
        />
        <p className="dc-field-hint">{tr("timeLimitNote")}</p>
      </div>
    </>
  );
}

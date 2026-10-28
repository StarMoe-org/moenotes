"use client";

import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import type { AppLocale } from "@/config/locales";
import { Icon } from "@/components/shared/icons";
import { t } from "@/i18n";
import {
  ARENA_BAND_IDS,
  ARENA_MISSION_TYPES,
  ARENA_MUSIC_TYPES,
  effectiveArenaSongRule,
  type DeckArenaCatalog,
  type DeckArenaMissions,
  type DeckArenaMode,
  type DeckArenaPeriod,
  type DeckArenaRule,
  type DeckArenaRuleSource,
} from "@/lib/deck/arena";
import type { MusicViewModel } from "@/lib/music/data";
import { MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import { DeckSegmented, DeckSelect } from "./DeckControls";

export interface DeckArenaSongEntry {
  musicId: number;
  difficulty: MusicDifficulty;
}

export interface DeckArenaControlsProps {
  locale: AppLocale;
  catalog: DeckArenaCatalog;
  period: DeckArenaPeriod;
  rule: DeckArenaRule | null;
  ruleSource: DeckArenaRuleSource;
  leagueId: number;
  customBandId: number;
  customMusicType: number;
  customMissions: DeckArenaMissions;
  mode: DeckArenaMode;
  canChooseMode: boolean;
  allSongs: boolean;
  entries: readonly DeckArenaSongEntry[];
  eligibleSongs: readonly MusicViewModel[];
  bandNames: ReadonlyMap<number, string>;
  formatEnd: (endAt: string) => string;
  onRuleSourceChange: (source: DeckArenaRuleSource) => void;
  onLeagueChange: (leagueId: number) => void;
  onCustomBandChange: (bandId: number) => void;
  onCustomMusicTypeChange: (musicType: number) => void;
  onCustomMissionChange: (index: 0 | 1 | 2, mission: number) => void;
  onModeChange: (mode: DeckArenaMode) => void;
  onEntriesChange: (entries: DeckArenaSongEntry[]) => void;
  onOpenSongPicker: () => void;
}

export default function DeckArenaControls(props: DeckArenaControlsProps) {
  const { locale, catalog, period, rule, ruleSource, mode, entries, eligibleSongs, bandNames } = props;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.arena.${key}`, values);
  const bandLabel = (bandId: number) => bandNames.get(bandId) ?? tr("bandFallback", { id: bandId });
  const attributeLabel = (musicType: number) => {
    if (musicType === 0) return tr("musicTypeSongDefault");
    if (musicType === 99) return tr("musicTypeNone");
    return t(locale, `cards.attributes.${musicType}`);
  };
  const missionLabel = (mission: number) => {
    if (mission === 1) return tr("missionCombo");
    if (mission === 2) return tr("missionLuck");
    if (mission === 3) return tr("missionAccuracy");
    return tr("missionSongDefault");
  };
  const maxPool = mode === "shared" ? 5 : 20;

  function fillPool() {
    const chosen = new Set(entries.map((entry) => entry.musicId));
    const next = [...entries];
    for (const song of eligibleSongs) {
      if (next.length >= 5) break;
      if (chosen.has(song.id)) continue;
      const diff: MusicDifficulty = song.difficulties.some((d) => d.difficulty === "expert")
        ? "expert"
        : (song.difficulties.at(-1)?.difficulty ?? "expert");
      next.push({ musicId: song.id, difficulty: diff });
    }
    props.onEntriesChange(next);
  }

  return (
    <div className="dc-arena">
      <DeckSegmented
        label={tr("ruleSourceLabel")}
        value={ruleSource}
        onChange={props.onRuleSourceChange}
        options={(["auto", "custom"] as const).map((choice) => ({
          value: choice,
          label: tr(choice === "auto" ? "ruleAuto" : "ruleCustom"),
        }))}
      />

      {ruleSource === "auto" ? (
        <>
          <DeckSelect
            label={tr("leagueLabel")}
            value={props.leagueId}
            onChange={props.onLeagueChange}
            options={catalog.leagues.map((league) => ({
              value: league.id,
              label: tr("leagueOption", { id: league.id, band: bandLabel(league.bandId) }),
            }))}
          />
          {period.season && period.regulation && rule ? (
            <div className="dc-arena-summary" role="status">
              <div className="dc-arena-summary-head">
                <strong>
                  {tr("activeSummary", {
                    season: period.season.name || `#${period.season.id}`,
                    band: bandLabel(rule.bandId),
                  })}
                </strong>
                <small>{tr("endsAt", { end: props.formatEnd(period.regulation.endAt) })}</small>
              </div>
              <p>
                {attributeLabel(rule.musicType)} ·{" "}
                {rule.missions.every((m) => m === 0)
                  ? tr("missionsSongDefault")
                  : rule.missions.map(missionLabel).join(" / ")}
              </p>
            </div>
          ) : (
            <div className="dc-arena-summary is-inactive" role="status">
              <p>{tr("noActiveSeason")}</p>
              <Button variant="text" size="small" onClick={() => props.onRuleSourceChange("custom")}>
                {tr("useCustomAction")}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="dc-arena-custom">
          <div className="dc-field-pair">
            <DeckSelect
              label={tr("bandLabel")}
              value={props.customBandId}
              onChange={props.onCustomBandChange}
              options={ARENA_BAND_IDS.map((bandId) => ({
                value: bandId,
                label: bandLabel(bandId),
              }))}
            />
            <DeckSelect
              label={tr("musicTypeLabel")}
              value={props.customMusicType}
              onChange={props.onCustomMusicTypeChange}
              options={ARENA_MUSIC_TYPES.map((type) => ({
                value: type,
                label: attributeLabel(type),
              }))}
            />
          </div>
          <div className="dc-arena-missions">
            {([0, 1, 2] as const).map((index) => (
              <DeckSelect
                key={index}
                label={tr("missionSlotLabel", { n: index + 1 })}
                value={props.customMissions[index]}
                onChange={(mission) => props.onCustomMissionChange(index, mission)}
                options={ARENA_MISSION_TYPES.map((mission) => ({
                  value: mission,
                  label: missionLabel(mission),
                }))}
              />
            ))}
          </div>
        </div>
      )}

      {props.canChooseMode && (
        <DeckSegmented
          label={tr("modeLabel")}
          value={mode}
          onChange={props.onModeChange}
          hint={tr(mode === "shared" ? "modeSharedNote" : "modeIndividualNote")}
          options={(["shared", "individual"] as const).map((choice) => ({
            value: choice,
            label: tr(choice === "shared" ? "modeShared" : "modeIndividual"),
          }))}
        />
      )}

      {!props.allSongs && (
        <div className="dc-arena-pool">
          <div className="dc-arena-pool-head">
            <span className="dc-arena-pool-title">
              {tr(mode === "shared" ? "poolCountShared" : "poolCountIndividual", { n: entries.length })}
            </span>
            <div className="dc-arena-pool-actions">
              {entries.length < 5 && eligibleSongs.length > entries.length && (
                <Button variant="text" size="small" onClick={fillPool}>
                  {tr("fillFive")}
                </Button>
              )}
              {entries.length > 0 && (
                <Button variant="text" size="small" onClick={() => props.onEntriesChange([])}>
                  {tr("clearSongs")}
                </Button>
              )}
              <Button
                variant="tonal"
                size="small"
                disabled={!rule || entries.length >= maxPool || eligibleSongs.length === 0}
                onClick={props.onOpenSongPicker}
              >
                {tr("addSong")}
              </Button>
            </div>
          </div>

          {entries.length > 0 ? (
            <ul className="dc-arena-songs">
              {entries.map((entry, idx) => {
                const song = eligibleSongs.find((item) => item.id === entry.musicId);
                const effective = song && rule ? effectiveArenaSongRule(song, rule) : null;
                return (
                  <li key={`${entry.musicId}:${entry.difficulty}`} className="dc-arena-song">
                    {song ? (
                      <img className="dc-song-cover" src={song.jacketUrl} alt="" />
                    ) : (
                      <span className="dc-song-cover dc-song-cover--empty" aria-hidden="true" />
                    )}
                    <div className="dc-song-summary">
                      <strong>{song?.title ?? entry.musicId}</strong>
                      {effective && (
                        <small>
                          {attributeLabel(effective.musicType)} · {effective.missions.map(missionLabel).join(" / ")}
                        </small>
                      )}
                    </div>
                    <DeckSelect
                      compact
                      ariaLabel={`${song?.title ?? entry.musicId} ${t(locale, "deckWorkspace.difficulty")}`}
                      value={entry.difficulty}
                      onChange={(nextDiff) => {
                        const duplicate = entries.some(
                          (other, otherIdx) =>
                            otherIdx !== idx && other.musicId === entry.musicId && other.difficulty === nextDiff,
                        );
                        if (duplicate) return;
                        props.onEntriesChange(
                          entries.map((other, otherIdx) =>
                            otherIdx === idx ? { ...other, difficulty: nextDiff } : other,
                          ),
                        );
                      }}
                      options={MUSIC_DIFFICULTIES.filter(
                        (diff) => !song || song.difficulties.some((d) => d.difficulty === diff),
                      ).map((diff) => ({
                        value: diff,
                        label: diff.toUpperCase(),
                      }))}
                    />
                    <IconButton
                      size="small"
                      aria-label={tr("removeSong")}
                      onClick={() => props.onEntriesChange(entries.filter((_, otherIdx) => otherIdx !== idx))}
                    >
                      <Icon name="close" className="h-[18px] w-[18px]" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dc-field-hint">{tr("emptyPoolHint", { band: bandLabel(rule?.bandId ?? 1) })}</p>
          )}
        </div>
      )}
    </div>
  );
}

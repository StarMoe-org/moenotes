import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import AudioPlayButton from "@/components/shared/AudioPlayButton";
import SiriusLoader from "@/components/shared/SiriusLoader";
import { Empty, Panel } from "@/components/characters/CharacterSections";
import { setQueue, type AudioTrack } from "@/lib/audio/player";
import type { CardViewModel } from "@/lib/cards/data";
import {
  characterVoiceLines,
  groupVoiceLines,
  voiceAudioUrl,
  voiceText,
  type CharacterVoicesPayload,
  type VoiceGroup,
  type VoiceLine,
} from "@/lib/characters/voices";
import { loadCharacterVoices } from "@/lib/characters/voices-client";
import { scoreRankLabel } from "@/lib/missions/describe";
import { entityLinkPath } from "@/lib/route/entity-link";
import { useAssetUrl, useContentServerScope } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  characterId: number;
  /** Every character's name, for pair dialogues and birthday lines. */
  characterNames: ReadonlyMap<number, string>;
  /** The character's member cards on the page's server, for gacha voice lines. */
  cards: readonly CardViewModel[];
}

type LoadState = { status: "loading" } | { status: "error" } | { status: "ready"; payload: CharacterVoicesPayload };

/** Every voice line of the character by source, fetched from `/character-voices.json` when the section opens. */
export default function CharacterVoicesSection({ locale, characterId, characterNames, cards }: Props) {
  const { server } = useContentServerScope();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void loadCharacterVoices().then((payload) => {
      if (!cancelled) setState(payload ? { status: "ready", payload } : { status: "error" });
    });
    return () => { cancelled = true; };
  }, [attempt]);

  const payload = state.status === "ready" ? state.payload : null;
  const groups = useMemo(() => (payload ? groupVoiceLines(characterVoiceLines(payload, server, characterId)) : []), [payload, server, characterId]);

  if (state.status === "loading") return <SiriusLoader locale={locale} label={t(locale, "characters.voices.loading")} className="mn-paper min-h-48" />;
  if (state.status === "error" || !payload) {
    return (
      <MdMuiProvider>
        <Card variant="outlined" sx={{ p: 4, textAlign: "center" }} role="alert">
          <Typography variant="body2" sx={{ fontWeight: 500, color: "var(--md-sys-color-on-surface-variant)" }}>{t(locale, "characters.voices.loadError")}</Typography>
          <Button variant="outlined" onClick={() => setAttempt((value) => value + 1)} sx={{ mt: 2 }}>
            {t(locale, "cards.retry")}
          </Button>
        </Card>
      </MdMuiProvider>
    );
  }
  if (groups.length === 0) return <Panel title={t(locale, "characters.sections.voices")}><Empty text={t(locale, "characters.voices.empty")} /></Panel>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {groups.map((group) => (
        <VoiceGroupPanel key={group.source} locale={locale} group={group} payload={payload} characterId={characterId} characterNames={characterNames} cards={cards} />
      ))}
    </Box>
  );
}

interface GroupProps {
  locale: AppLocale;
  group: VoiceGroup;
  payload: CharacterVoicesPayload;
  characterId: number;
  characterNames: ReadonlyMap<number, string>;
  cards: readonly CardViewModel[];
}

function VoiceGroupPanel({ locale, group, payload, characterId, characterNames, cards }: GroupProps) {
  const assetUrl = useAssetUrl();
  const title = t(locale, `characters.voices.sources.${group.source}`);
  const nameOf = useCallback((id: number) => characterNames.get(id) ?? `#${id}`, [characterNames]);

  const trackOf = useCallback((line: VoiceLine, own: boolean): AudioTrack | null => {
    const sound = own ? line.sound : line.partnerSound;
    const src = voiceAudioUrl(sound, locale);
    if (!src) return null;
    const speaker = own ? line.characterId : line.partnerId ?? 0;
    return {
      id: `character-voice:${line.source}:${line.id}:${speaker}`,
      src: assetUrl(src),
      title: voiceText(payload, own ? line.text : line.partnerText, locale) || title,
      subtitle: `${nameOf(speaker)} · ${title}`,
    };
  }, [assetUrl, locale, payload, title, nameOf]);

  // A pair dialogue plays as the exchange: the opening line, then the answer.
  const queue = useMemo(() => group.sections.flatMap((section) => section.lines.flatMap((line) => {
    if (line.source !== "liveDialogueFixedPair") return [trackOf(line, true)];
    return line.pairOrder === 2 ? [trackOf(line, false), trackOf(line, true)] : [trackOf(line, true), trackOf(line, false)];
  })).filter((track): track is AudioTrack => track !== null), [group, trackOf]);

  const playAll = queue.length > 1 ? (
    <Button
      variant="outlined"
      size="small"
      onClick={() => setQueue(queue)}
      startIcon={<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
    >
      {t(locale, "characters.voices.playAll", { count: queue.length })}
    </Button>
  ) : null;

  return (
    <Panel title={title} actions={playAll}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        {group.sections.map((section) => (
          <section key={section.kind ?? "all"}>
            {section.kind && group.source === "talk" && (
              <Typography component="h4" variant="caption" sx={{ mb: 0.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--md-sys-color-on-surface-variant)" }}>
                {t(locale, `characters.voices.talk.${section.kind}`)} <span className="tabular-nums">({section.lines.length})</span>
              </Typography>
            )}
            <ul className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/60">
              {section.lines.map((line) => (
                <VoiceLineRow key={`${line.source}:${line.id}:${line.characterId}`} locale={locale} line={line} payload={payload} characterId={characterId} nameOf={nameOf} cards={cards} trackOf={trackOf} />
              ))}
            </ul>
          </section>
        ))}
      </Box>
    </Panel>
  );
}

const linkClass = "font-bold text-[var(--md-sys-color-primary)] underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]";

interface LineProps {
  locale: AppLocale;
  line: VoiceLine;
  payload: CharacterVoicesPayload;
  characterId: number;
  nameOf: (id: number) => string;
  cards: readonly CardViewModel[];
  trackOf: (line: VoiceLine, own: boolean) => AudioTrack | null;
}

function lineLabel(locale: AppLocale, line: VoiceLine): string {
  switch (line.source) {
    case "characterVoice": {
      const type = t(locale, `characters.voices.types.${line.kind ?? "other"}`);
      const rank = line.scoreRank ? scoreRankLabel(line.scoreRank) : "";
      return rank ? `${type} · ${rank}` : type;
    }
    case "liveGekisou": return t(locale, `characters.voices.gekisou.${line.kind ?? "other"}`);
    case "liveDialogueCommon":
    case "liveDialogueFixedPair": return t(locale, `characters.voices.dialogue.${line.kind ?? "other"}`);
    default: return "";
  }
}

function VoiceLineRow({ locale, line, payload, characterId, nameOf, cards, trackOf }: LineProps) {
  const own = trackOf(line, true);
  const text = voiceText(payload, line.text, locale);
  const label = lineLabel(locale, line);
  const meta: React.ReactNode[] = [];
  if (line.unlockRank && line.unlockRank > 1) meta.push(t(locale, "characters.voices.unlockRank", { rank: line.unlockRank }));
  if (line.seasonStart || line.seasonEnd) meta.push(t(locale, "characters.voices.season", { start: line.seasonStart ?? "", end: line.seasonEnd ?? "" }));
  if (line.birthdayCharacterId) {
    meta.push(line.birthdayCharacterId === characterId
      ? t(locale, "characters.voices.ownBirthday")
      : <a key="birthday" className={linkClass} href={localizePath(entityLinkPath({ routeId: "characters", detailId: line.birthdayCharacterId }), locale)}>{t(locale, "characters.voices.birthdayOf", { name: nameOf(line.birthdayCharacterId) })}</a>);
  }
  if (line.cardId) {
    const card = cards.find((entry) => entry.id === line.cardId);
    meta.push(<a key="card" className={linkClass} href={localizePath(entityLinkPath({ routeId: "cards", detailId: line.cardId }), locale)}>{card?.title || t(locale, "characters.voices.cardFallback", { id: line.cardId })}</a>);
  }
  if (line.unlockFriendshipRank) meta.push(t(locale, "characters.voices.unlockBond", { rank: line.unlockFriendshipRank }));

  const partner = line.source === "liveDialogueFixedPair" && line.partnerId ? line.partnerId : 0;
  const partnerTrack = partner ? trackOf(line, false) : null;
  const ownBlock = (
    <div className="flex items-start gap-3">
      {own ? <AudioPlayButton locale={locale} size="sm" track={own} /> : <span className="h-8 w-8 shrink-0" />}
      <div className="min-w-0">
        {partner ? <p className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">{nameOf(line.characterId)}</p> : null}
        <p className="whitespace-pre-line text-sm font-medium text-[var(--md-sys-color-on-surface)]">{text || "—"}</p>
      </div>
    </div>
  );
  const partnerBlock = partner ? (
    <div className="flex items-start gap-3">
      {partnerTrack ? <AudioPlayButton locale={locale} size="sm" track={partnerTrack} /> : <span className="h-8 w-8 shrink-0" />}
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">{nameOf(partner)}</p>
        <p className="whitespace-pre-line text-sm font-medium text-[var(--md-sys-color-on-surface-variant)]">{voiceText(payload, line.partnerText, locale) || "—"}</p>
      </div>
    </div>
  ) : null;

  return (
    <li className="space-y-2 py-3">
      {(label || partner || meta.length > 0) && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-primary)]">
          {label && <span>{label}</span>}
          {partner ? (
            <a className={`${linkClass} normal-case tracking-normal`} href={localizePath(entityLinkPath({ routeId: "characters", detailId: partner }), locale)}>
              {t(locale, "characters.voices.withPartner", { name: nameOf(partner) })}
            </a>
          ) : null}
          {meta.map((entry, index) => (
            <span key={index} className="rounded-full border border-[var(--md-sys-color-outline-variant)]/60 px-2 py-0.5 normal-case tracking-normal text-[var(--md-sys-color-on-surface-variant)]">{entry}</span>
          ))}
        </p>
      )}
      {partner && line.pairOrder === 2 ? <>{partnerBlock}{ownBlock}</> : <>{ownBlock}{partnerBlock}</>}
    </li>
  );
}

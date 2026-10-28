"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withMd3 } from "@/components/md3/Md3Provider";
import PrimaryTabs from "@/components/shared/PrimaryTabs";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { SETTINGS_PARAMS, hasSettingsParams } from "@/lib/guess-music/settings";
import type { GuessSong } from "@/lib/guess-music/songs";
import type { ServerFaceted } from "@/lib/servers/facets";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";
import DailyChallenge from "./DailyChallenge";
import FreePlayTool from "./FreePlayTool";
import GuessIcon from "./GuessIcon";

export interface GuessMusicToolProps {
  locale: AppLocale;
  songs: ServerFaceted<GuessSong>[];
  servers: GameServer[];
}

type GuessTab = "daily" | "free";
const TABS: Array<{ id: GuessTab; icon: "calendar" | "tune" }> = [
  { id: "daily", icon: "calendar" },
  { id: "free", icon: "tune" },
];

/**
 * Guess the song: the daily challenge (questions, clips and leaderboards from starmoe-api) and free play (all in the
 * browser). `?tab=free`, or a free-play share link, opens free play; the daily challenge is the default.
 */
function GuessMusicTool({ locale, songs, servers }: GuessMusicToolProps) {
  const tr = (key: string) => t(locale, `guessMusic.${key}`);
  const { showSpoiler, now } = useSpoilerSetting();
  const visibleSongs = useMemo(() => {
    if (showSpoiler) return songs;
    return songs.filter((song) => !isSpoiler(song.startAt, now));
  }, [songs, showSpoiler, now]);

  // The static HTML knows no address: it shows the default tab, and the address picks once mounted.
  const [tab, setTab] = useState<GuessTab>("daily");
  // A run or a game is on screen: the tabs hide, so nothing keeps playing behind another tab.
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "free" || hasSettingsParams(params)) setTab("free");
  }, []);

  const choose = useCallback((next: GuessTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "free") url.searchParams.set("tab", "free");
    else {
      url.searchParams.delete("tab");
      for (const name of SETTINGS_PARAMS) url.searchParams.delete(name);
    }
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  return (
    <div className="gm-root">
      {!playing && (
        <PrimaryTabs
          tabs={TABS.map(({ id, icon }) => ({ value: id, label: tr(`tabs.${id}`), icon: <GuessIcon name={icon} size={24} /> }))}
          value={tab}
          onChange={choose}
          label={tr("tabs.label")}
          tabId={(id) => `gm-tab-${id}`}
          panelId="gm-tab-panel"
        />
      )}
      <div id="gm-tab-panel" role="tabpanel" aria-labelledby={`gm-tab-${tab}`} className="gm-stack" style={{ gap: 16 }}>
        {tab === "daily" ? (
          <DailyChallenge locale={locale} songs={visibleSongs} onPlayingChange={setPlaying} onPlayFree={() => choose("free")} />
        ) : (
          <FreePlayTool locale={locale} songs={visibleSongs} servers={servers} onPlayingChange={setPlaying} />
        )}
      </div>
    </div>
  );
}

export default withMd3(GuessMusicTool);

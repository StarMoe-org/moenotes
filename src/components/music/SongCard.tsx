import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import ListCardBadge from "@/components/shared/ListCardBadge";
import { getBandSmallIconUrl, getCardTypeIconUrl, type CardType } from "@/lib/cards/assets";
import type { MusicViewModel } from "@/lib/music/data";
import { getRoutePathById } from "@/lib/route/registry";

interface Props {
  song: MusicViewModel;
  locale: AppLocale;
  onClick?: () => void;
  /** Short overlay label on the jacket, e.g. an upcoming release. */
  badge?: string;
}

const difficultyKeys = ["easy", "normal", "hard", "expert"] as const;

const diffColors = {
  easy: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-900/50",
  normal: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
  hard: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
  expert: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50",
};

const shortDiffLabels: Record<(typeof difficultyKeys)[number], string> = {
  easy: "EZ",
  normal: "NM",
  hard: "HD",
  expert: "EX",
};

export default function SongCard({ song, locale, onClick, badge }: Props) {
  return (
    <a
      href={localizePath(`${getRoutePathById("music")}/${song.id}`, locale)}
      onClick={onClick}
      className="mn-list-card mn-focus group block relative rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] overflow-hidden shadow-[var(--mn-shadow-stamp)] transition-all hover:scale-[1.01] hover:shadow-[var(--mn-shadow-stamp-lg)] hover:-translate-y-0.5"
    >
      {/* Top Cover Block */}
      <div className="relative aspect-square w-full shrink-0 border-b-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)] overflow-hidden">
        <img
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          src={song.jacketUrl}
          alt={song.title}
          loading="lazy"
        />
        {/* Band Icon Overlaid (Top Left) */}
        <img
          className="absolute top-2 left-2 z-10 h-6 w-auto object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          src={getBandSmallIconUrl(song.bandId)}
          alt={song.bandName}
          title={song.bandName}
          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
        />
        {/* Attribute Icon Overlaid (Top Right) */}
        <img
          className="absolute top-2 right-2 z-10 h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          src={getCardTypeIconUrl(song.musicType as CardType)}
          alt=""
          aria-hidden="true"
        />
        {badge && <ListCardBadge label={badge} position="bottom-2 left-2" />}
      </div>

      {/* Bottom Info Area */}
      <div className="p-3 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="font-[var(--mn-font-display)] text-[15px] font-bold leading-snug text-[var(--mn-text)] truncate group-hover:text-[var(--mn-accent-deep)] transition-colors">
            {song.title}
          </h3>
          <p className="text-[10px] font-medium text-[var(--mn-text-muted)] truncate">
            {t(locale, "music.composer")}: {song.composer}
          </p>
        </div>

        {/* Difficulties Display */}
        <div className="flex items-center gap-1">
          {difficultyKeys.map((diffKey) => {
            const diff = song.difficulties.find((d) => d.difficulty === diffKey);
            if (!diff) return null;

            return (
              <div
                key={diffKey}
                className={`flex-1 text-center py-0.5 rounded text-[8px] font-black border uppercase tracking-tighter ${diffColors[diffKey]}`}
              >
                <span className="block opacity-60 text-[6px] leading-none mb-0.5">{shortDiffLabels[diffKey]}</span>
                <span className="font-mono text-[10px]">{diff.displayLevel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </a>
  );
}

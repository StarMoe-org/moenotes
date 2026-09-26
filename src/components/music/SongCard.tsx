import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import ListCardBadge from "@/components/shared/ListCardBadge";
import { getBandSmallIconUrl, getCardTypeIconUrl, type CardType } from "@/lib/cards/assets";
import type { MusicViewModel } from "@/lib/music/data";
import { getRoutePathById } from "@/lib/route/registry";
import { DIFFICULTY_CHIP_CLASSES, DIFFICULTY_SHORT_LABELS, MUSIC_DIFFICULTIES } from "@/lib/music/difficulty";

interface Props {
  song: MusicViewModel;
  locale: AppLocale;
  onClick?: () => void;
  /** Short overlay label on the jacket, e.g. an upcoming release. */
  badge?: string;
}

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
          {MUSIC_DIFFICULTIES.map((diffKey) => {
            const diff = song.difficulties.find((d) => d.difficulty === diffKey);
            if (!diff) return null;

            return (
              <div
                key={diffKey}
                className={`flex-1 text-center py-0.5 rounded text-[8px] font-black border uppercase tracking-tighter ${DIFFICULTY_CHIP_CLASSES[diffKey]}`}
              >
                <span className="block opacity-60 text-[6px] leading-none mb-0.5">{DIFFICULTY_SHORT_LABELS[diffKey]}</span>
                <span className="font-mono text-[10px]">{diff.displayLevel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </a>
  );
}

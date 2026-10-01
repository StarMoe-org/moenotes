import { Fragment, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getCardFrameUrl, getCardRankIconUrl, getCardThumbnailUrl, getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { levelFromExp, type DeckCardLookup, type RankingDeckCard, type RankingRow } from "@/lib/game-api/music-ranking";
import { buildDynamicPath, findRouteById } from "@/lib/route/registry";
import { getSupportCardFrameUrl, getSupportCardRankIconUrl, getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";
import PlayerNamecard from "@/components/music/PlayerNamecard";

export type AssetUrl = (url: string | undefined | null) => string;

interface Props {
  locale: AppLocale;
  rows: RankingRow[];
  cards: DeckCardLookup;
  /** Moves deck card files to the ranking's server catalog. */
  assetUrl: AssetUrl;
  /** Ranks after which a dashed cut-off line is drawn (reward band ends). */
  boundaries?: readonly number[];
  /** Server for fetching player namecards. */
  server: GameServer;
}

const COLLAPSED_ROWS = 20;

/**
 * Ranking rows (place, player, score, deck) with the deck opening under its row: song rankings and event challenge
 * boards share it. Shows the top 20 until expanded.
 */
export default function RankingList({ locale, rows, cards, assetUrl, boundaries = [], server }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  const numbers = new Intl.NumberFormat(locale);
  const cutoffs = new Set(boundaries);

  return (
    <>
      <div className="hidden grid-cols-[3rem_minmax(0,1fr)_7rem] gap-3 border-b border-dashed border-[var(--mn-border)]/60 px-2 pb-2 text-[10px] font-black uppercase tracking-wider text-[var(--mn-text-muted)] sm:grid md:grid-cols-[3rem_minmax(0,1fr)_7rem_12.5rem]">
        <span>{t(locale, "music.ranking.columns.rank")}</span>
        <span>{t(locale, "music.ranking.columns.player")}</span>
        <span className="text-right">{t(locale, "music.ranking.columns.score")}</span>
        <span className="hidden md:block">{t(locale, "music.ranking.columns.deck")}</span>
      </div>
      <ol className="divide-y divide-dashed divide-[var(--mn-border)]/50">
        {shown.map((row, index) => (
          <Fragment key={row.uid}>
            <RankingRowItem
              locale={locale}
              row={row}
              cards={cards}
              assetUrl={assetUrl}
              numbers={numbers}
              open={openRow === row.uid}
              onToggle={() => setOpenRow((current) => (current === row.uid ? null : row.uid))}
              server={server}
            />
            {cutoffs.has(row.rank) && index < shown.length - 1 && (
              <li aria-hidden="true" className="flex items-center gap-2 px-2 py-1 text-[10px] font-black tracking-wider text-[var(--mn-accent-deep)]">
                <span className="h-px flex-1 border-t border-dashed border-[var(--mn-accent)]/60" />
                {t(locale, "eventTracker.cutoff", { rank: numbers.format(row.rank) })}
                <span className="h-px flex-1 border-t border-dashed border-[var(--mn-accent)]/60" />
              </li>
            )}
          </Fragment>
        ))}
      </ol>
      {rows.length > COLLAPSED_ROWS && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mn-focus mn-stamp-press rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
          >
            {expanded ? t(locale, "music.ranking.showLess") : t(locale, "music.ranking.showAll", { count: rows.length })}
          </button>
        </div>
      )}
    </>
  );
}

function RankingRowItem({ locale, row, cards, assetUrl, numbers, open, onToggle, server }: {
  locale: AppLocale;
  row: RankingRow;
  cards: DeckCardLookup;
  assetUrl: AssetUrl;
  numbers: Intl.NumberFormat;
  open: boolean;
  onToggle: () => void;
  server: GameServer;
}) {
  const podium = row.rank <= 3 ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text)]";
  const hasNamecard = row.profileCard && row.profileCard.images > 0;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="mn-focus grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--mn-cream-deep)] sm:grid-cols-[3rem_minmax(0,1fr)_7rem] md:grid-cols-[3rem_minmax(0,1fr)_7rem_12.5rem]"
      >
        <span className={`font-mono text-base font-black ${podium}`}>
          {row.rank}
          {row.tied && <span className="ml-0.5 align-top text-[9px] font-bold text-[var(--mn-text-muted)]" title={t(locale, "music.ranking.tied")}>=</span>}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {hasNamecard && (
            <PlayerNamecard
              server={server}
              profileId={row.profileId}
              images={row.profileCard.images}
              playerName={row.name}
              variant="thumbnail"
              useRankingApi={true}
            />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-[var(--mn-text)]">{row.name}</span>
            {row.totalPower !== null && (
              <span className="block truncate text-[10px] font-semibold text-[var(--mn-text-muted)]">
                {t(locale, "music.ranking.power", { power: numbers.format(row.totalPower) })}
              </span>
            )}
          </span>
        </span>
        <span className="text-right font-mono text-sm font-black text-[var(--mn-text)]">{numbers.format(row.score)}</span>
        <span className="hidden grid-cols-5 gap-1 md:grid" aria-hidden="true">
          {row.cards.slice(0, 5).map((card) => <MemberThumb key={card.slot} card={card} cards={cards} assetUrl={assetUrl} locale={locale} compact />)}
        </span>
      </button>
      {open && <DeckDetail locale={locale} row={row} cards={cards} assetUrl={assetUrl} numbers={numbers} />}
    </li>
  );
}

function DeckDetail({ locale, row, cards, assetUrl, numbers }: { locale: AppLocale; row: RankingRow; cards: DeckCardLookup; assetUrl: AssetUrl; numbers: Intl.NumberFormat }) {
  const cardRoute = findRouteById("card-detail");
  const supportRoute = findRouteById("support-card-detail");
  const href = (route: typeof cardRoute, id: number | null) =>
    route && id !== null ? localizePath(buildDynamicPath(route.pattern ?? route.path, { id: String(id) }), locale) : undefined;

  return (
    <div className="mx-2 mb-3 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-surface)] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-[11px] font-semibold text-[var(--mn-text-muted)]">
        <span className="font-bold text-[var(--mn-text)]">{row.deckName || t(locale, "music.ranking.columns.deck")}</span>
        {row.totalPower !== null && <span>{t(locale, "music.ranking.power", { power: numbers.format(row.totalPower) })}</span>}
      </div>
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {row.cards.map((card) => {
          const member = card.memberCardId !== null ? cards.member[String(card.memberCardId)] : undefined;
          const support = card.supportCardId !== null ? cards.support[String(card.supportCardId)] : undefined;
          const memberHref = member ? href(cardRoute, card.memberCardId) : undefined;
          const supportHref = support ? href(supportRoute, card.supportCardId) : undefined;
          return (
            <div key={card.slot} className="min-w-0 space-y-2">
              <a href={memberHref} className="mn-focus block rounded-[4px]" title={member?.[4]}>
                <MemberThumb card={card} cards={cards} assetUrl={assetUrl} locale={locale} />
              </a>
              {card.supportCardId !== null && (
                <a href={supportHref} className="mn-focus block rounded-[4px]" title={support?.[3]}>
                  <SupportThumb card={card} id={card.supportCardId} cards={cards} assetUrl={assetUrl} locale={locale} />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The awaken icon goes on the bottom right, and the level on the bottom left unless `compact` (the row's small preview). */
function MemberThumb({ card, cards, assetUrl, locale, compact = false }: { card: RankingDeckCard; cards: DeckCardLookup; assetUrl: AssetUrl; locale: AppLocale; compact?: boolean }) {
  const entry = card.memberCardId !== null ? cards.member[String(card.memberCardId)] : undefined;
  const [fallback, setFallback] = useState(false);
  if (!entry) return <UnknownThumb id={card.memberCardId} ratio="aspect-[3/4]" />;
  const [assetId, characterId, rarity, , title, levelGroup] = entry;
  return (
    <span className="relative block aspect-[3/4] overflow-hidden rounded-[4px] bg-[var(--mn-cream-deep)]">
      <img
        className="h-full w-full object-cover"
        src={assetUrl(fallback ? getCharacterFaceIconUrl(characterId) : getCardThumbnailUrl(assetId))}
        alt={title}
        loading="lazy"
        onError={() => setFallback(true)}
      />
      <img className="pointer-events-none absolute inset-0 h-full w-full" src={getCardFrameUrl(rarity)} alt="" aria-hidden="true" />
      <CardBadges
        locale={locale}
        level={compact ? null : levelFromExp(cards.levelExp.member[String(levelGroup)], card.memberExp)}
        rankIcon={card.cardRank !== null ? getCardRankIconUrl(card.cardRank) : null}
        rankLabel={`${t(locale, "cards.growth.awaken")} ${card.cardRank ?? ""}`}
        iconClassName={compact ? "bottom-[2%] w-[44%]" : "bottom-[3%] w-[30%]"}
      />
    </span>
  );
}

function SupportThumb({ card, id, cards, assetUrl, locale }: { card: RankingDeckCard; id: number; cards: DeckCardLookup; assetUrl: AssetUrl; locale: AppLocale }) {
  const entry = cards.support[String(id)];
  if (!entry) return <UnknownThumb id={id} ratio="aspect-[16/9]" />;
  const [assetId, rarity, , title, levelGroup] = entry;
  const frame = getSupportCardFrameUrl(rarity);
  return (
    <span className="relative block aspect-[16/9] overflow-hidden rounded-[4px] bg-[var(--mn-cream-deep)]">
      <img className="h-full w-full object-cover" src={assetUrl(getSupportCardThumbnailUrl(assetId))} alt={title} loading="lazy" />
      {frame && <img className="pointer-events-none absolute inset-0 h-full w-full" src={frame} alt="" aria-hidden="true" />}
      <CardBadges
        locale={locale}
        level={levelFromExp(cards.levelExp.support[String(levelGroup)], card.supportExp)}
        rankIcon={card.supportRank !== null ? getSupportCardRankIconUrl(card.supportRank) : null}
        rankLabel={`${t(locale, "supportCards.growth.limitBreak")} ${card.supportRank ?? ""}`}
        iconClassName="bottom-[31%] h-[38%] w-auto"
      />
    </span>
  );
}

/** Level on the bottom left of a card thumbnail, the rank icon on the right (`iconClassName` places it against the frame). */
function CardBadges({ locale, level, rankIcon, rankLabel, iconClassName }: { locale: AppLocale; level: number | null; rankIcon: string | null; rankLabel: string; iconClassName: string }) {
  return (
    <>
      {level !== null && (
        <span className="pointer-events-none absolute bottom-[5%] left-[7%] font-mono text-[10px] font-black leading-none text-white [text-shadow:0_0_2px_rgb(0_0_0/0.9),0_1px_3px_rgb(0_0_0/0.8)] sm:text-xs">
          {t(locale, "music.ranking.level", { level })}
        </span>
      )}
      {rankIcon && <img className={`pointer-events-none absolute right-[4%] drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)] ${iconClassName}`} src={rankIcon} alt={rankLabel} title={rankLabel} />}
    </>
  );
}

/** A card the site's MasterData does not know yet (the ranking can be newer than the last build). */
function UnknownThumb({ id, ratio }: { id: number | null; ratio: string }) {
  return (
    <span className={`grid ${ratio} place-items-center rounded-[4px] border border-dashed border-[var(--mn-border)] bg-[var(--mn-cream-deep)] font-mono text-[9px] text-[var(--mn-text-muted)]`}>
      {id !== null ? `#${id}` : "?"}
    </span>
  );
}

export function RankingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2 px-2" role="status" aria-label={label}>
      <p className="pb-1 text-center text-xs font-semibold text-[var(--mn-text-muted)]">{label}</p>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-xl bg-[var(--mn-cream-deep)]" />
      ))}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { GameServer } from "@/config/game-api";
import type { AppLocale } from "@/config/locales";
import { PRIMARY_SERVER } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import { getCardFrameUrl, getCardRankIconUrl, getCardThumbnailUrl, getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { GameApiError, fetchMusicRanking } from "@/lib/game-api/client";
import { levelFromExp, toRankingRows, type DeckCardLookup, type RankingDeckCard, type RankingRow } from "@/lib/game-api/music-ranking";
import { formatAge } from "@/lib/game-api/server";
import { useGameServer } from "@/lib/game-api/use-game-server";
import { buildDynamicPath, findRouteById } from "@/lib/route/registry";
import { useServerAssetUrl } from "@/lib/servers/use-content-server";
import { getSupportCardFrameUrl, getSupportCardRankIconUrl, getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";

interface Props {
  locale: AppLocale;
  musicId: number;
  cards: DeckCardLookup;
}

type Load =
  | { state: "loading" }
  | { state: "ready"; server: GameServer; rows: RankingRow[]; fetchedAt: number | null; serverTime: number | null; stale: boolean }
  | { state: "error"; kind: "pending" | "upstream" | "failed" };

const COLLAPSED_ROWS = 20;
/** rankd answers `pending` while the song waits in its queue; one automatic retry covers the usual wait. */
const AUTO_RETRIES = 1;

/**
 * The song's high-score ranking on one game server, from rankd. It loads once the block scrolls near the
 * viewport: most visitors of a song page never look at it.
 */
export default function MusicRanking({ locale, musicId, cards }: Props) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [server, setServer] = useGameServer(locale);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [expanded, setExpanded] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "300px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!server || !visible) return;
    const controller = new AbortController();
    let retryTimer: number | undefined;
    setLoad({ state: "loading" });
    fetchMusicRanking(server, musicId, controller.signal)
      .then((response) => setLoad({
        state: "ready",
        server,
        rows: toRankingRows(response.data),
        fetchedAt: response.fetchedAt,
        serverTime: response.serverTime,
        stale: response.stale,
      }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof GameApiError && (error.kind === "pending" || error.kind === "upstream") ? error.kind : "failed";
        if (kind === "pending" && attempt < AUTO_RETRIES) {
          const seconds = error instanceof GameApiError && error.retryAfter ? error.retryAfter : 5;
          retryTimer = window.setTimeout(() => setAttempt((value) => value + 1), Math.min(Math.max(seconds, 2), 15) * 1000);
          return;
        }
        setLoad({ state: "error", kind });
      });
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, [server, visible, musicId, attempt]);

  const pickServer = (next: GameServer) => {
    setServer(next);
    setAttempt(0);
    setExpanded(false);
    setOpenRow(null);
  };

  const rows = load.state === "ready" ? load.rows : [];
  // Deck cards show from the catalog of the ranking's server, which has every card its players own.
  const assetUrl = useServerAssetUrl(load.state === "ready" ? load.server : server ?? PRIMARY_SERVER);
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  const numbers = new Intl.NumberFormat(locale);

  return (
    <section ref={rootRef} className="mn-paper overflow-hidden" aria-labelledby="music-ranking-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
        <h3 id="music-ranking-title" className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">
          {t(locale, "music.ranking.title")}
        </h3>
        <GameServerSwitch locale={locale} value={server} onChange={pickServer} />
      </div>

      <div className="px-4 py-4 sm:px-6">
        {load.state === "ready" && load.fetchedAt !== null && (
          <p className="mb-3 px-2 text-right text-[11px] font-semibold text-[var(--mn-text-muted)]" title={new Date(load.fetchedAt).toLocaleString(locale)}>
            {t(locale, "music.ranking.updatedAgo", { time: formatAge(load.fetchedAt, load.serverTime ?? load.fetchedAt, locale) })}
            {load.stale && ` · ${t(locale, "music.ranking.refreshing")}`}
          </p>
        )}

        {load.state === "loading" && <RankingSkeleton label={t(locale, "music.ranking.loading")} />}

        {load.state === "error" && (
          <div className="px-2 py-8 text-center" role="status">
            <p className="text-sm font-bold text-[var(--mn-text)]">{t(locale, `music.ranking.errors.${load.kind}`)}</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-6 text-[var(--mn-text-muted)]">{t(locale, `music.ranking.errors.${load.kind}Hint`)}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mn-focus mn-stamp-press mt-4 rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
            >
              {t(locale, "music.ranking.retry")}
            </button>
          </div>
        )}

        {load.state === "ready" && rows.length === 0 && (
          <p className="px-2 py-8 text-center text-sm font-semibold text-[var(--mn-text-muted)]">{t(locale, "music.ranking.empty")}</p>
        )}

        {rows.length > 0 && (
          <>
            <div className="hidden grid-cols-[3rem_minmax(0,1fr)_7rem] gap-3 border-b border-dashed border-[var(--mn-border)]/60 px-2 pb-2 text-[10px] font-black uppercase tracking-wider text-[var(--mn-text-muted)] sm:grid md:grid-cols-[3rem_minmax(0,1fr)_7rem_12.5rem]">
              <span>{t(locale, "music.ranking.columns.rank")}</span>
              <span>{t(locale, "music.ranking.columns.player")}</span>
              <span className="text-right">{t(locale, "music.ranking.columns.score")}</span>
              <span className="hidden md:block">{t(locale, "music.ranking.columns.deck")}</span>
            </div>
            <ol className="divide-y divide-dashed divide-[var(--mn-border)]/50">
              {shown.map((row) => (
                <RankingRowItem
                  key={row.uid}
                  locale={locale}
                  row={row}
                  cards={cards}
                  assetUrl={assetUrl}
                  numbers={numbers}
                  open={openRow === row.uid}
                  onToggle={() => setOpenRow((current) => (current === row.uid ? null : row.uid))}
                />
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
        )}
      </div>
    </section>
  );
}

type AssetUrl = (url: string | undefined | null) => string;

function RankingRowItem({ locale, row, cards, assetUrl, numbers, open, onToggle }: {
  locale: AppLocale;
  row: RankingRow;
  cards: DeckCardLookup;
  assetUrl: AssetUrl;
  numbers: Intl.NumberFormat;
  open: boolean;
  onToggle: () => void;
}) {
  const podium = row.rank <= 3 ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text)]";
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
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-[var(--mn-text)]">{row.name}</span>
          {row.totalPower !== null && (
            <span className="block truncate text-[10px] font-semibold text-[var(--mn-text-muted)]">
              {t(locale, "music.ranking.power", { power: numbers.format(row.totalPower) })}
            </span>
          )}
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

function RankingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2 px-2" role="status" aria-label={label}>
      <p className="pb-1 text-center text-xs font-semibold text-[var(--mn-text-muted)]">{label}</p>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-xl bg-[var(--mn-cream-deep)]" />
      ))}
    </div>
  );
}

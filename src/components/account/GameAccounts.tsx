"use client";

import SiriusLoader, { SiriusIcon } from "@/components/shared/SiriusLoader";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import PlayerProfileCard from "@/components/account/PlayerProfileCard";
import ShareImageButton from "@/components/account/ShareImageButton";
import { GAME_SERVERS, type GameServer, isGameProfileId, playerPagePath } from "@/config/players";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import {
  type GameAccount,
  type GameAccountError,
  GameAccountRequestError,
  type GameAccountsState,
  addGameAccount,
  loadGameAccounts,
  loadOwnProfile,
  refreshGameCode,
  refreshOwnProfile,
  removeGameAccount,
  setGameAccountPublic,
  verifyGameAccount,
} from "@/lib/account/game-accounts";
import type { PlayerSnapshot } from "@/lib/account/player-profile";
import type { ProfileCardInfo } from "@/lib/account/profile-cards";

interface Props {
  locale: AppLocale;
  panel: string;
  stampButton: string;
  /** Build time data from profile-cards.ts. */
  cards: ProfileCardInfo[];
}

/** A message for the card; `account` ties it to that account's row, otherwise it shows under the card. */
type Notice = { tone: "error" | "info" | "success"; text: string; account?: string | undefined };

/** Error codes with their own message; everything else reads as "try again". */
const errorMessages: Partial<Record<GameAccountError, string>> = {
  invalid_account: "account.games.errors.invalidAccount",
  player_not_found: "account.games.errors.playerNotFound",
  already_added: "account.games.errors.alreadyAdded",
  too_many_accounts: "account.games.errors.tooManyAccounts",
  already_verified: "account.games.errors.alreadyVerified",
  not_found: "account.games.errors.notFound",
  not_verified: "account.games.errors.notVerified",
  too_soon: "account.games.errors.tooSoon",
  game_unavailable: "account.games.errors.gameUnavailable",
};

/** The user may add this many accounts, verified or not; starmoe-api enforces it too. */
const MAX_ACCOUNTS = 10;

function errorMessage(locale: AppLocale, error: unknown): string {
  const key = error instanceof GameAccountRequestError ? errorMessages[error.code] : undefined;
  return t(locale, key ?? "account.games.errors.generic");
}

const keyOf = (account: { server: GameServer; profileId: string }) => `${account.server}/${account.profileId}`;

/**
 * Our Notes accounts under the passport user, each unverified or verified. Adding one gives it a code; the user
 * puts the code in their in-game name and verifies, and starmoe-api reads the public profile to see it (its
 * README, "Game accounts").
 */
export default function GameAccounts({ locale, panel, stampButton, cards }: Props) {
  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const [state, setState] = useState<GameAccountsState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // The account whose panel is open: verification steps when unverified, the profile when verified.
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadGameAccounts()
      .then((loaded) => {
        setState(loaded);
        // With exactly one account waiting, or else exactly one account, open it straight away.
        const pending = loaded.accounts.filter((a) => !a.verified);
        const only = pending.length === 1 ? pending[0] : pending.length === 0 && loaded.accounts.length === 1 ? loaded.accounts[0] : undefined;
        if (only) setOpen(keyOf(only));
      })
      .catch(() => setLoadFailed(true));
  }, []);

  function errorNotice(error: unknown, account?: string): Notice {
    if (error instanceof GameAccountRequestError && error.code === "name_mismatch") {
      return { tone: "info", account, text: t(locale, "account.games.nameMismatch", { name: error.seenName || t(locale, "account.games.unnamed") }) };
    }
    return { tone: "error", account, text: errorMessage(locale, error) };
  }

  /** Runs one call for `account` (a row key, or undefined for the add form); `onDone` picks the notice. */
  async function run(account: string | undefined, call: () => Promise<GameAccountsState>, onDone?: (next: GameAccountsState) => Notice | null) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const next = await call();
      setState(next);
      setNotice(onDone?.(next) ?? null);
    } catch (error) {
      setNotice(errorNotice(error, account));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <>
      <h2 className="text-label-large text-on-surface">{t(locale, "account.games.title")}</h2>
      <p className="mt-1 text-body-small text-on-surface-variant">{t(locale, "account.games.hint")}</p>
    </>
  );

  if (!state) {
    return (
      <div className={panel}>
        {header}
        <div className="mt-4 text-body-medium text-on-surface-variant">{loadFailed ? t(locale, "account.games.loadFailed") : <SiriusLoader locale={locale} compact label={t(locale, "account.loading")} />}</div>
      </div>
    );
  }

  const nameOf = (account: GameAccount) => account.name || t(locale, "account.games.unnamed");

  return (
    <div className={panel}>
      {header}

      {state.accounts.length > 0 && (
        <ul className="mt-4 divide-y divide-dashed divide-outline-variant/60">
          {state.accounts.map((account) => {
            const key = keyOf(account);
            return (
              <AccountRow
                key={key}
                locale={locale}
                account={account}
                busy={busy}
                stampButton={stampButton}
                open={open === key}
                cards={cardMap}
                notice={notice?.account === key ? notice : null}
                canVerify={state.available}
                onToggle={() => {
                  setOpen(open === key ? null : key);
                  if (notice?.account) setNotice(null);
                }}
                onVerify={() =>
                  void run(key, () => verifyGameAccount(account.server, account.profileId), () => {
                    // Stays open: the panel turns into the profile.
                    setOpen(key);
                    return { tone: "success", account: key, text: t(locale, "account.games.verifiedNotice", { name: nameOf(account) }) };
                  })
                }
                onRefresh={() =>
                  void run(key, () => refreshGameCode(account.server, account.profileId), () => ({
                    tone: "info",
                    account: key,
                    text: t(locale, "account.games.codeRefreshed"),
                  }))
                }
                onRemove={() => void run(key, () => removeGameAccount(account.server, account.profileId))}
                onPublic={(isPublic) => void run(key, () => setGameAccountPublic(account.server, account.profileId, isPublic))}
              />
            );
          })}
        </ul>
      )}

      {!state.available ? (
        <p className="mt-4 text-body-medium text-on-surface-variant">{t(locale, "account.games.unavailable")}</p>
      ) : state.accounts.length >= MAX_ACCOUNTS ? (
        <p className="mt-4 text-body-small text-on-surface-variant">{t(locale, "account.games.errors.tooManyAccounts")}</p>
      ) : (
        <AddForm
          locale={locale}
          busy={busy}
          stampButton={stampButton}
          hasAccounts={state.accounts.length > 0}
          onAdd={(server, profileId) =>
            void run(undefined, () => addGameAccount(server, profileId), (next) => {
              const added = next.accounts.find((a) => a.server === server && a.profileId === profileId);
              const key = keyOf({ server, profileId });
              setOpen(key);
              return { tone: "success", account: key, text: t(locale, "account.games.addedNotice", { name: added ? nameOf(added) : profileId }) };
            })
          }
        />
      )}

      {notice && !notice.account && <NoticeLine notice={notice} />}
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <p
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mt-3 text-body-small ${ notice.tone === "error" ? "text-error" : notice.tone === "success" ? "font-bold text-primary" : "text-on-surface-variant" }`}
    >
      {notice.text}
    </p>
  );
}

function serverLabel(locale: AppLocale, server: GameServer): string {
  return t(locale, `account.games.servers.${server}`);
}

interface RowProps {
  locale: AppLocale;
  account: GameAccount;
  busy: boolean;
  stampButton: string;
  open: boolean;
  cards: ReadonlyMap<number, ProfileCardInfo>;
  notice: Notice | null;
  canVerify: boolean;
  onToggle: () => void;
  onVerify: () => void;
  onRefresh: () => void;
  onRemove: () => void;
  onPublic: (isPublic: boolean) => void;
}

function AccountRow(props: RowProps) {
  const { locale, account, busy, stampButton, open, cards, notice, canVerify, onToggle, onVerify, onRefresh, onRemove, onPublic } = props;
  const [confirming, setConfirming] = useState(false);
  const meta = account.verifiedAt
    ? t(locale, "account.games.verifiedMeta", {
        id: account.profileId,
        date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(account.verifiedAt)),
      })
    : t(locale, "account.games.unverifiedMeta", { id: account.profileId });

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-outline-variant bg-surface-container-highest px-2 py-0.5 text-label-small text-on-surface">
          {serverLabel(locale, account.server)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-label-large text-on-surface">{account.name || t(locale, "account.games.unnamed")}</p>
            <StatusPill locale={locale} verified={account.verified} />
          </div>
          <p className="text-body-small text-on-surface-variant">{meta}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {confirming ? (
            <>
              <button type="button" disabled={busy} onClick={onRemove} className={`${stampButton} enabled:text-error`}>
                {t(locale, "account.games.removeConfirm")}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={stampButton}>
                {t(locale, "account.games.keep")}
              </button>
            </>
          ) : (
            <>
              {account.verified ? (
                <button type="button" aria-expanded={open} onClick={onToggle} className={stampButton}>
                  {t(locale, open ? "account.games.hideVerify" : "account.profile.show")}
                </button>
              ) : (
                canVerify && (
                  <button type="button" aria-expanded={open} onClick={onToggle} className={stampButton}>
                    {t(locale, open ? "account.games.hideVerify" : "account.games.startVerify")}
                  </button>
                )
              )}
              <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={stampButton}>
                {t(locale, "account.games.remove")}
              </button>
            </>
          )}
        </div>
      </div>

      {open && !account.verified && account.code && (
        <VerifyPanel locale={locale} code={account.code} busy={busy} stampButton={stampButton} onVerify={onVerify} onRefresh={onRefresh} />
      )}
      {open && account.verified && (
        <ProfilePanel locale={locale} account={account} cards={cards} busy={busy} stampButton={stampButton} onPublic={onPublic} />
      )}
      {notice && <NoticeLine notice={notice} />}
    </li>
  );
}

/** A verified account's profile, with its public switch and a refresh from the game. */
function ProfilePanel({
  locale,
  account,
  cards,
  busy,
  stampButton,
  onPublic,
}: {
  locale: AppLocale;
  account: GameAccount;
  cards: ReadonlyMap<number, ProfileCardInfo>;
  busy: boolean;
  stampButton: string;
  onPublic: (isPublic: boolean) => void;
}) {
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    loadOwnProfile(account.server, account.profileId)
      .then((loaded) => {
        if (active) setSnapshot(loaded);
      })
      .catch((failure: unknown) => {
        if (active) setError(errorMessage(locale, failure));
      });
    return () => {
      active = false;
    };
  }, [account.server, account.profileId, locale]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      setSnapshot(await refreshOwnProfile(account.server, account.profileId));
    } catch (failure) {
      setError(errorMessage(locale, failure));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-shape-lg border border-outline-variant p-4">
      {snapshot ? (
        <PlayerProfileCard locale={locale} snapshot={snapshot} cards={cards} own />
      ) : (
        !error && <SiriusLoader locale={locale} compact label={t(locale, "account.profile.loading")} />
      )}
      {error && (
        <p role="alert" className="text-body-small text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-outline-variant pt-3">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            role="switch"
            checked={account.public}
            disabled={busy}
            onChange={(event) => onPublic(event.target.checked)}
            className="md3-checkbox -mt-px"
          />
          <span className="min-w-0">
            <span className="block text-label-large text-on-surface">{t(locale, "account.profile.public")}</span>
            <span className="block text-body-small text-on-surface-variant">
              {t(locale, account.public ? "account.profile.publicOn" : "account.profile.publicOff")}
            </span>
          </span>
        </label>
        <button type="button" disabled={refreshing} onClick={() => void refresh()} className={stampButton}>
          {t(locale, refreshing ? "account.games.checking" : "account.profile.refresh")}
        </button>
        {snapshot && <ShareImageButton locale={locale} snapshot={snapshot} cards={cards} isPublic={account.public} own stampButton={stampButton} />}
      </div>
      {account.public && <PublicLink locale={locale} account={account} stampButton={stampButton} />}
    </div>
  );
}

/** The public page's address, to copy or open. */
function PublicLink({ locale, account, stampButton }: { locale: AppLocale; account: GameAccount; stampButton: string }) {
  const [copied, setCopied] = useState(false);
  // Only rendered once signed in, which happens in the browser.
  const href = localizePath(playerPagePath(account.server, account.profileId), locale);
  const url = new URL(href, window.location.origin).href;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The address is on screen to copy by hand.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 select-all truncate rounded-shape-md border border-outline-variant bg-surface-container-highest px-3 py-2 font-mono text-body-small text-on-surface">
        {url}
      </code>
      <button type="button" onClick={() => void copy()} className={stampButton}>
        {t(locale, copied ? "account.games.copied" : "account.profile.copyLink")}
      </button>
      <a href={href} target="_blank" rel="noopener" className={stampButton}>
        {t(locale, "account.profile.openPage")}
      </a>
    </div>
  );
}

function StatusPill({ locale, verified }: { locale: AppLocale; verified: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-label-small ${ verified ? "border-primary/40 bg-secondary-container text-primary" : "border-dashed border-outline-variant text-on-surface-variant" }`}
    >
      {t(locale, verified ? "account.games.verified" : "account.games.unverified")}
    </span>
  );
}

function VerifyPanel({
  locale,
  code,
  busy,
  stampButton,
  onVerify,
  onRefresh,
}: {
  locale: AppLocale;
  code: string;
  busy: boolean;
  stampButton: string;
  onVerify: () => void;
  onRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The code is on screen to type by hand.
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-shape-lg border border-primary/40 bg-secondary-container/40 p-4">
      <ol className="list-decimal space-y-1 pl-5 text-body-small text-on-surface-variant">
        <li>{t(locale, "account.games.stepRename")}</li>
        <li>{t(locale, "account.games.stepVerify")}</li>
        <li>{t(locale, "account.games.stepRestore")}</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <code
          aria-label={t(locale, "account.games.codeLabel")}
          className="select-all rounded-shape-md border border-outline-variant bg-surface-container-low px-4 py-2 font-mono text-label-medium text-on-surface"
        >
          {code}
        </code>
        <button type="button" onClick={() => void copy()} className={stampButton}>
          {t(locale, copied ? "account.games.copied" : "account.games.copy")}
        </button>
        <button type="button" disabled={busy} onClick={onRefresh} className={stampButton}>
          {t(locale, "account.games.refreshCode")}
        </button>
      </div>
      <p className="text-body-small text-on-surface-variant">{t(locale, "account.games.refreshHint")}</p>
      <button type="button" disabled={busy} onClick={onVerify} className={stampButton}>
        {busy && <SiriusIcon className="" />}{t(locale, busy ? "account.games.checking" : "account.games.verify")}
      </button>
    </div>
  );
}

function AddForm({
  locale,
  busy,
  stampButton,
  hasAccounts,
  onAdd,
}: {
  locale: AppLocale;
  busy: boolean;
  stampButton: string;
  hasAccounts: boolean;
  onAdd: (server: GameServer, profileId: string) => void;
}) {
  const [server, setServer] = useState<GameServer>("tw");
  const [profileId, setProfileId] = useState("");
  const trimmed = profileId.trim();
  const valid = isGameProfileId(server, trimmed);
  const showInvalid = trimmed !== "" && !valid;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) onAdd(server, trimmed);
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-shape-lg border border-dashed border-outline-variant p-4">
      <p className="text-label-large text-on-surface">{t(locale, hasAccounts ? "account.games.addAnother" : "account.games.add")}</p>
      <fieldset>
        <legend className="mb-2 text-label-medium text-on-surface-variant">{t(locale, "account.games.server")}</legend>
        <div className="flex flex-wrap gap-2">
          {GAME_SERVERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={server === option}
              onClick={() => setServer(option)}
              className={`rounded-shape-md border px-3 py-1.5 text-label-medium transition-colors ${ server === option ? "border-primary/45 bg-secondary-container text-primary" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-highest" }`}
            >
              {serverLabel(locale, option)}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="game-profile-id" className="mb-2 block text-label-medium text-on-surface-variant">
          {t(locale, "account.games.profileId")}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="game-profile-id"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            aria-invalid={showInvalid}
            aria-describedby="game-profile-id-hint"
            className="min-w-0 flex-1 rounded-shape-md border border-outline-variant bg-surface-container px-4 py-2 font-mono text-body-medium text-on-surface focus:border-primary focus:bg-surface-container-low focus:outline-none"
          />
          <button type="submit" disabled={busy || !valid} className={stampButton}>
            {busy && <SiriusIcon className="" />}{t(locale, busy ? "account.games.checking" : "account.games.addButton")}
          </button>
        </div>
        <p id="game-profile-id-hint" className={`mt-2 text-body-small ${showInvalid ? "text-error" : "text-on-surface-variant"}`}>
          {t(locale, showInvalid ? "account.games.errors.invalidAccount" : server === "jp" ? "account.games.profileIdHintJp" : "account.games.profileIdHint")}
        </p>
      </div>
    </form>
  );
}

import SiriusLoader from "@/components/shared/SiriusLoader";
import { useEffect, useState } from "react";
import SaveAuthorizations from "@/components/account/SaveAuthorizations";
import AccountAvatar from "@/components/account/AccountAvatar";
import GameAccounts from "@/components/account/GameAccounts";
import Modal from "@/components/shared/Modal";
import { accountLoginUrl, passportAccountUrl } from "@/config/account";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { type AccountAvatar as AvatarChoice, type AccountUser, saveAvatar } from "@/lib/account/client";
import { accountAvatarUrl } from "@/lib/account/avatar-url";
import type { ProfileCardInfo } from "@/lib/account/profile-cards";
import { useAccount } from "@/lib/account/use-account";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { getRoutePathById } from "@/lib/route/registry";
import SectionHeading from "@/components/shared/SectionHeading";

/** Build time data from avatar-options.ts. */
export interface AvatarBand {
  id: number;
  name: string;
  color: string;
  characters: Array<{ id: number; name: string }>;
}

interface Props {
  locale: AppLocale;
  bands: AvatarBand[];
  /** Build time data from profile-cards.ts. */
  cards: ProfileCardInfo[];
}

import { accountSection as panel } from "./ui-styles";
const stampButton =
  "mn-focus mn-stamp-press inline-flex h-10 items-center rounded-xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 text-sm font-black text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-cream-deep)]";

export default function AccountPanel({ locale, bands, cards }: Props) {
  const account = useAccount();
  // The panel keeps its own copy: it is the only place that changes the profile.
  const [user, setUser] = useState<AccountUser | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [returnPath, setReturnPath] = useState<string>(localizePath(getRoutePathById("account"), locale));

  useEffect(() => {
    setReturnPath(window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    if (account?.status === "signed-in") setUser(account.user);
  }, [account]);

  if (!account) return <SiriusLoader locale={locale} compact label={t(locale, "account.loading")} />;

  if (account.status === "unavailable") {
    return (
      <div className={panel}>
        <p className="text-sm text-[var(--mn-text-muted)]">{t(locale, "account.unavailable")}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`${panel} text-center`}>
        <p className="mb-4 text-sm text-[var(--mn-text-muted)]">{t(locale, "account.signedOutHint")}</p>
        <a href={accountLoginUrl(locale, returnPath)} className={stampButton}>
          {t(locale, "account.signIn")}
        </a>
      </div>
    );
  }

  const displayName = user.name ?? user.username ?? t(locale, "account.passport");

  return (
    <div className="space-y-7">
      <SectionHeading title={t(locale, "account.overviewTitle")} />
      <div className={`${panel} flex flex-wrap items-center gap-4`}>
        <AccountAvatar url={accountAvatarUrl(user)} name={displayName} className="h-16 w-16 rounded-2xl text-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black text-[var(--mn-text)]">{displayName}</p>
          {user.username && <p className="truncate text-sm text-[var(--mn-text-muted)]">@{user.username}</p>}
          <p className="mt-1 text-xs text-[var(--mn-text-muted)]">{t(locale, "account.passport")}</p>
        </div>
        <button type="button" onClick={() => setPickerOpen(true)} className={stampButton}>
          {t(locale, "account.changeAvatar")}
        </button>
      </div>

      <section>
        <SectionHeading title={t(locale, "account.gameAccountsTitle")} />
        <div className="mt-4"><GameAccounts locale={locale} panel={panel} stampButton={stampButton} cards={cards} /></div>
      </section>

      <section>
        <SectionHeading title={t(locale, "account.authorizationsTitle")} />
        <div className="mt-4"><SaveAuthorizations locale={locale} panel={panel} /></div>
      </section>

      <section>
        <SectionHeading title={t(locale, "account.securitySectionTitle")} />
        <div className="mt-4"><PassportSecurity locale={locale} /></div>
      </section>

      <AvatarPicker
        locale={locale}
        bands={bands}
        user={user}
        displayName={displayName}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSaved={(saved) => {
          setUser(saved);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

const securityTasks = [
  { page: "password", title: "account.password", hint: "account.passwordHint" },
  { page: "email", title: "account.email", hint: "account.emailHint" },
] as const;

/**
 * Security settings belong to the passport and apply on every StarMoe site, so this only links to its Account
 * Center. The single tasks come back here when done; the security hub opens in a new tab since it has no way back.
 */
function PassportSecurity({ locale }: { locale: AppLocale }) {
  // Only rendered once signed in, which happens in the browser.
  const returnTo = window.location.href;
  const row = "flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0";

  return (
    <div className={panel}>
      <h2 className="text-sm font-black text-[var(--mn-text)]">{t(locale, "account.securityTitle")}</h2>
      <p className="mt-1 text-xs text-[var(--mn-text-muted)]">{t(locale, "account.securityHint")}</p>
      <div className="mt-4 divide-y divide-dashed divide-[var(--mn-border)]/60">
        {securityTasks.map((task) => (
          <div key={task.page} className={row}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[var(--mn-text)]">{t(locale, task.title)}</p>
              <p className="text-xs text-[var(--mn-text-muted)]">{t(locale, task.hint)}</p>
            </div>
            <a href={passportAccountUrl(task.page, locale, returnTo)} className={stampButton}>
              {t(locale, "account.change")}
            </a>
          </div>
        ))}
        <div className={row}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--mn-text)]">{t(locale, "account.securityCenter")}</p>
            <p className="text-xs text-[var(--mn-text-muted)]">{t(locale, "account.securityCenterHint")}</p>
          </div>
          <a href={passportAccountUrl("security", locale, returnTo)} target="_blank" rel="noopener" className={stampButton}>
            {t(locale, "account.open")}
          </a>
        </div>
      </div>
    </div>
  );
}

interface PickerProps {
  locale: AppLocale;
  bands: AvatarBand[];
  user: AccountUser;
  displayName: string;
  open: boolean;
  onClose: () => void;
  onSaved: (user: AccountUser) => void;
}

/** The avatar dialog: pick a character (or the passport picture back); it saves on click and closes. */
function AvatarPicker({ locale, bands, user, displayName, open, onClose, onSaved }: PickerProps) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const selectedId = user.avatar?.kind === "character" ? user.avatar.id : null;

  useEffect(() => {
    if (open) setFailed(false);
  }, [open]);

  async function choose(avatar: AvatarChoice | null) {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      onSaved(await saveAvatar(avatar));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const tile = (active: boolean) =>
    `mn-focus relative aspect-square overflow-hidden rounded-2xl border-[1.5px] transition-transform hover:scale-[1.04] disabled:opacity-60 ${
      active ? "border-[var(--mn-accent)] ring-2 ring-[var(--mn-accent)]/40" : "border-[var(--mn-border)]"
    }`;

  return (
    <Modal isOpen={open} onClose={onClose} title={t(locale, "account.changeAvatar")} closeLabel={t(locale, "actions.close")} size="lg">
      <p className="mb-4 text-xs text-[var(--mn-text-muted)]">{t(locale, "account.avatarHint")}</p>

      <button
        type="button"
        onClick={() => void choose(null)}
        disabled={saving}
        aria-pressed={selectedId === null}
        className={`mn-focus mb-5 flex items-center gap-2 rounded-xl border-[1.5px] py-1.5 pl-1.5 pr-3 text-xs font-bold transition-colors disabled:opacity-60 ${
          selectedId === null
            ? "border-[color-mix(in_oklab,var(--mn-accent)_45%,transparent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
            : "border-[var(--mn-border)] text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"
        }`}
      >
        <AccountAvatar url={user.picture} name={displayName} className="h-8 w-8 rounded-lg text-xs" />
        {t(locale, "account.avatarDefault")}
      </button>

      <div className="space-y-5">
        {bands.map((band) => (
          <div key={band.id}>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: band.color }} aria-hidden="true" />
              <span className="text-xs font-black uppercase tracking-wider text-[var(--mn-text-muted)]">{band.name}</span>
            </div>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
              {band.characters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => void choose({ kind: "character", id: character.id })}
                  disabled={saving}
                  aria-pressed={selectedId === character.id}
                  title={character.name}
                  className={tile(selectedId === character.id)}
                >
                  <img src={getCharacterFaceIconUrl(character.id)} alt={character.name} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {saving && <SiriusLoader locale={locale} compact label={t(locale, "account.saving")} />}
      {failed && <p className="mt-4 text-xs text-[var(--mn-danger,#ba1b1b)]">{t(locale, "account.saveFailed")}</p>}
    </Modal>
  );
}

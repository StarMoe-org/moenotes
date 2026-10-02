import SiriusLoader from "@/components/shared/SiriusLoader";
import { useEffect, useState } from "react";
import Modal from "@/components/shared/Modal";
import { playerCardPath } from "@/config/account";
import type { AppLocale } from "@/config/locales";
import { playerPagePath } from "@/config/players";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import type { PlayerSnapshot } from "@/lib/account/player-profile";
import type { ProfileCardInfo } from "@/lib/account/profile-cards";
import { renderShareImage, SHARE_HEIGHT, SHARE_WIDTH } from "@/lib/account/share-image";
import { serverAssetUrl } from "@/lib/assets/release";
import { getCardFullUrl } from "@/lib/cards/assets";

interface Props {
  locale: AppLocale;
  snapshot: PlayerSnapshot;
  cards: ReadonlyMap<number, ProfileCardInfo>;
  /** Whether the profile page is public: only then does the image carry its address. */
  isPublic: boolean;
  /** The signed-in holder's own profile: its card images are read as theirs, so a private page works too. */
  own?: boolean;
  stampButton: string;
}

type Status = "idle" | "rendering" | "ready" | "failed";

/** Draws the portrait share image in the browser and offers to save, copy or share it. */
export default function ShareImageButton({ locale, snapshot, cards, isPublic, own = false, stampButton }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function generate() {
    setOpen(true);
    setStatus("rendering");
    setCopied(false);
    const card = snapshot.favoriteCard ? cards.get(snapshot.favoriteCard.cardId) : undefined;
    const server = t(locale, `account.games.servers.${snapshot.server}`);
    const link = isPublic ? new URL(localizePath(playerPagePath(snapshot.server, snapshot.profileId), locale), window.location.origin) : null;
    try {
      const image = await renderShareImage(
        {
          name: snapshot.name ?? t(locale, "account.games.unnamed"),
          subtitle: `${server} · ID ${snapshot.profileId}`,
          stats: [
            { label: t(locale, "account.profile.level"), value: snapshot.level === null ? "—" : `Lv.${snapshot.level}` },
            { label: t(locale, "account.profile.favorites"), value: snapshot.favorites === null ? "—" : String(snapshot.favorites) },
          ],
          badge: t(locale, "player.verified"),
          caption: card ? t(locale, "account.profile.favoriteCard", { title: card.title, character: card.characterName }) : "",
          link: link ? `${link.host}${link.pathname}` : "",
          artUrl: card ? serverAssetUrl(getCardFullUrl(card.assetId), snapshot.server) : null,
          profileCardUrl: snapshot.profileCard ? playerCardPath(snapshot.server, snapshot.profileId, 0, own) : null,
        },
        getComputedStyle(document.body).fontFamily,
      );
      setBlob(image);
      setPreview(URL.createObjectURL(image));
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  }

  const fileName = `moenotes-${snapshot.server}-${snapshot.profileId}.png`;
  const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
  const canShare = Boolean(file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));

  async function copy() {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: snapshot.name ?? fileName });
    } catch {
      // Dismissed, or the platform refused; the image can still be saved.
    }
  }

  return (
    <>
      <button type="button" onClick={() => void generate()} className={stampButton}>
        {t(locale, "account.share.button")}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={t(locale, "account.share.title")} closeLabel={t(locale, "actions.close")} size="md">
        <div className="space-y-4">
          <div
            className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)]"
            style={{ aspectRatio: `${SHARE_WIDTH} / ${SHARE_HEIGHT}` }}
          >
            {status === "ready" && preview ? (
              <img src={preview} alt={t(locale, "account.share.alt", { name: snapshot.name ?? snapshot.profileId })} className="h-full w-full" />
            ) : status !== "failed" ? (
              <SiriusLoader locale={locale} label={t(locale, "account.share.rendering")} className="h-full" />
            ) : (
              <p className="grid h-full place-items-center p-6 text-center text-sm text-[var(--mn-text-muted)]">
                {t(locale, "account.share.failed")}
              </p>
            )}
          </div>
          <p className="text-center text-xs text-[var(--mn-text-muted)]">{t(locale, "account.share.hint")}</p>
          {status === "ready" && preview && (
            <div className="flex flex-wrap justify-center gap-2">
              <a href={preview} download={fileName} className={stampButton}>
                {t(locale, "account.share.download")}
              </a>
              {typeof ClipboardItem !== "undefined" && (
                <button type="button" onClick={() => void copy()} className={stampButton}>
                  {t(locale, copied ? "account.share.copied" : "account.share.copy")}
                </button>
              )}
              {canShare && (
                <button type="button" onClick={() => void share()} className={stampButton}>
                  {t(locale, "account.share.share")}
                </button>
              )}
            </div>
          )}
          {status === "failed" && (
            <div className="flex justify-center">
              <button type="button" onClick={() => void generate()} className={stampButton}>
                {t(locale, "account.share.retry")}
              </button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

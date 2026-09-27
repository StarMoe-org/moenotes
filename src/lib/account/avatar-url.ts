import type { AccountUser } from "@/lib/account/client";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";

/** The image to show for a user: the character they picked, else the passport picture, else none. */
export function accountAvatarUrl(user: AccountUser): string | null {
  if (user.avatar?.kind === "character") return getCharacterFaceIconUrl(user.avatar.id);
  return user.picture;
}

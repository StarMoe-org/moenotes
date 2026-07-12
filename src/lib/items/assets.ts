import { getAssetUrl } from "@/lib/assets/url";

export function getItemIconUrl(imagePath: string): string {
  if (!imagePath) return "";
  const path = imagePath.includes(".") ? imagePath : `${imagePath}.png`;
  return getAssetUrl({ path });
}

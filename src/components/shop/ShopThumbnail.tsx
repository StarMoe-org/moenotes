"use client";

import { useState } from "react";
import { useAssetUrl } from "@/lib/servers/use-content-server";

interface Props {
  src: string;
  alt: string;
  /** Shown in place of the art when the pack has none or it fails to load. */
  fallback: string;
  className?: string;
  eager?: boolean;
}

/**
 * A pack's shop sprite (`Shop/ItemThumbnail/…`). The ladder's sprites are 306×200 and the event packs' wide banners;
 * both are fitted whole into one frame so a list of mixed packs lines up.
 */
export default function ShopThumbnail({ src: neutralSrc, alt, fallback, className = "", eager = false }: Props) {
  const src = useAssetUrl()(neutralSrc);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;
  return (
    <div className={`relative aspect-[3/2] overflow-hidden bg-surface-container-highest ${className}`.trim()}>
      {failed ? (
        <div className="md3-placeholder grid h-full place-items-center p-3 text-center text-label-medium text-on-surface-variant">
          <span className="line-clamp-3">{fallback}</span>
        </div>
      ) : (
        <img className="h-full w-full object-contain" src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailedSrc(src)} />
      )}
    </div>
  );
}

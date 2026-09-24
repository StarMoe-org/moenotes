import { useState } from "react";

interface Props {
  src: string;
  alt: string;
  /** Shown in place of the artwork when it is missing or fails to load. */
  fallback: string;
  className?: string;
  eager?: boolean;
}

/** In-game banner artwork (7:3), shared by the gacha pages and the home carousel. */
export default function BannerImage({ src, alt, fallback, className = "", eager = false }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;

  return (
    <div className={`relative aspect-[7/3] overflow-hidden bg-[var(--mn-cream-deep)] ${className}`.trim()}>
      {failed ? (
        <div className="mn-texture-orbit grid h-full place-items-center p-4 text-center text-sm font-bold text-[var(--mn-text-muted)]">
          <span className="line-clamp-2">{fallback}</span>
        </div>
      ) : (
        <img
          className="h-full w-full object-cover"
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      )}
    </div>
  );
}

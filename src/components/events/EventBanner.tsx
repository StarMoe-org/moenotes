import { useState } from "react";
import BannerImage from "@/components/shared/BannerImage";
import type { EventViewModel } from "@/lib/events/data";
import { useAssetUrl } from "@/lib/servers/use-content-server";

type EventArt = Pick<EventViewModel, "name" | "bannerUrl" | "logoUrl" | "backgroundUrl">;

interface Props {
  event: EventArt;
  alt: string;
  eager?: boolean;
  className?: string;
}

/** An event's 7:3 artwork: its story chapter's banner, or else its top-screen art with the logo. */
export default function EventBanner({ event, alt, eager = false, className = "" }: Props) {
  if (event.bannerUrl || !event.backgroundUrl) {
    return <BannerImage src={event.bannerUrl} alt={alt} fallback={event.name} eager={eager} className={className} />;
  }
  return <EventScene event={event} alt={alt} eager={eager} className={`aspect-[7/3] ${className}`} />;
}

/** The event's top-screen art (4:3, its characters on the left) with the logo over the right side. */
export function EventScene({ event, alt, eager = false, className = "" }: Props) {
  const assetUrl = useAssetUrl();
  const background = assetUrl(event.backgroundUrl);
  const logo = assetUrl(event.logoUrl);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const fail = (src: string) => setFailed((current) => new Set(current).add(src));
  const hasBackground = Boolean(background) && !failed.has(background);
  const hasLogo = Boolean(logo) && !failed.has(logo);

  return (
    <div className={`relative overflow-hidden bg-[var(--mn-cream-deep)] ${className}`.trim()}>
      {hasBackground ? (
        <img
          className="absolute inset-0 h-full w-full object-cover object-[30%_35%]"
          src={background}
          alt=""
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          onError={() => fail(background)}
        />
      ) : (
        <div className="mn-texture-orbit absolute inset-0" aria-hidden="true" />
      )}
      {hasBackground && <div className="absolute inset-y-0 right-0 w-3/5 bg-gradient-to-l from-black/30 to-transparent" aria-hidden="true" />}
      {hasLogo ? (
        <img
          className="absolute right-[4%] top-1/2 w-[42%] max-w-[30rem] -translate-y-1/2 object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
          src={logo}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => fail(logo)}
        />
      ) : (
        <span className={`absolute right-[5%] top-1/2 line-clamp-3 max-w-[45%] -translate-y-1/2 text-right text-lg font-black sm:text-2xl ${hasBackground ? "text-white drop-shadow" : "text-[var(--mn-text)]"}`}>{event.name}</span>
      )}
    </div>
  );
}

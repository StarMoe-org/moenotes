import { useEffect, useState } from "react";

/**
 * A user's avatar, falling back to the name's initial when there is no image or it fails to load (pictures from
 * some sign-in providers are unreachable from mainland China).
 */
export default function AccountAvatar({ url, name, className }: { url: string | null; name: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className={`${className} grid shrink-0 place-items-center overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)] font-black text-[var(--mn-text)]`}>
      {url && !failed ? (
        <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{Array.from(name.trim())[0]?.toUpperCase() ?? "?"}</span>
      )}
    </span>
  );
}

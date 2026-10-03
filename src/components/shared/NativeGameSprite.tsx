import { useEffect, useState } from "react";
import { assetConfig } from "@/config/assets";
import { loadNativeUiLibrary } from "@/lib/game-ui/source";
import { useContentServerScope } from "@/lib/servers/use-content-server";

/** Small nnnotes exports use the same source and lazy SHA check as the card artwork. */
export default function NativeGameSprite({ assetKey, className = "", fallbackUrl }: {
  assetKey: string; className?: string; fallbackUrl?: string | undefined;
}) {
  const { server } = useContentServerScope();
  const configured = assetConfig.gameUiLibraries[server];
  const [image, setImage] = useState<{ key: string; server: string; url: string } | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    setFailed(false);
    if (configured) void loadNativeUiLibrary(configured, server).then(async library => {
      const url = await library.spriteUrl(assetKey);
      if (!disposed) setImage({ key: assetKey, server, url });
    }).catch(error => { if (!disposed) { setFailed(true); console.warn("Native Sprite resource", error); } });
    return () => { disposed = true; };
  }, [assetKey, configured, server]);
  const url = configured ? image?.key === assetKey && image.server === server ? image.url : "" : fallbackUrl;
  return <span className={`mn-native-sprite ${className}`.trim()} data-renderer="nnnotes-sprite" data-status={failed ? "error" : url && loaded === url ? "ready" : "loading"}>
    {url && <img key={url} src={url} alt="" onLoad={() => setLoaded(url)} onError={() => setFailed(true)} />}
  </span>;
}

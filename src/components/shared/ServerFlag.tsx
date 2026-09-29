import { flagIconSrc, type GameServer } from "@/config/servers";

/** A server's round flag: our own icons under public/flags, since emoji flags render differently per device. */
export default function ServerFlag({ server, className = "h-4 w-4" }: { server: GameServer; className?: string }) {
  return <img src={flagIconSrc(server)} alt="" aria-hidden="true" loading="lazy" decoding="async" className={`shrink-0 rounded-full ${className}`} />;
}

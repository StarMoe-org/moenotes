import type { GameServer } from "@/config/servers";
import type { RecognitionSourceStamp } from "@/lib/recognition/protocol";
import { getBuildMasterVersion, getBuildTableKey } from "./build-snapshot";

/** The same SSR snapshot stamps the already-loaded card catalogue; no second card directory is transmitted. */
export async function getBuildRecognitionSource(server: GameServer): Promise<RecognitionSourceStamp | null> {
  const [masterVersion, memberKey, snapKey] = await Promise.all([
    getBuildMasterVersion(server), getBuildTableKey(server, "MasterMemberCard.json"), getBuildTableKey(server, "MasterSupportCard.json"),
  ]);
  if (!masterVersion) return null;
  return { server, masterVersion, sourceId: `ui-master-observation:${server}:${masterVersion}:${memberKey}:${snapKey}` };
}

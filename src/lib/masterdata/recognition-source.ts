import type { GameServer } from "@/config/servers";
import type { RecognitionSourceStamp } from "@/lib/recognition/protocol";
import { getBuildMasterVersion, getBuildTableDigest } from "./build-snapshot";

/** The same SSR snapshot stamps the already-loaded card catalogue; no second card directory is transmitted. */
export async function getBuildRecognitionSource(server: GameServer): Promise<RecognitionSourceStamp | null> {
  try {
    const [masterVersion, memberDigest, snapDigest] = await Promise.all([
      getBuildMasterVersion(server),
      getBuildTableDigest(server, "MasterMemberCard.json"),
      getBuildTableDigest(server, "MasterSupportCard.json"),
    ]);
    if (!masterVersion) return null;
    return {
      server,
      masterVersion,
      sourceId: `ui-master-observation:${server}:${masterVersion}:${memberDigest}:${snapDigest}`,
    };
  } catch {
    return null;
  }
}

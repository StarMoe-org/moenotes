import imageFiles from "./generated/images.json";
import storyTables from "./generated/stories.json";

const images: Readonly<Record<string, string>> = imageFiles;
const stories: Readonly<Record<string, readonly string[]>> = storyTables;

/** Resolve only paths whose outputs were verified in the release manifest. */
export function resolveReleaseAssetPath(path: string): string | undefined {
  if (path.endsWith(".png")) {
    const key = path.slice(0, -4).replace(/^(MemberCard\/\d+\/[^/]+)_atlas$/, "$1");
    return images[key];
  }
  const match = path.match(/^Adv\/Episode\/([^/]+)\/\1-(Episode|Text|Sound|SoundCueSheet|Video)\.txt$/);
  if (match && stories[match[1]!]?.includes(match[2]!)) {
    const name = `${match[1]}-${match[2]}`;
    return `Adv/Episode/${match[1]}/${name}/${name}.json`;
  }
  return undefined;
}

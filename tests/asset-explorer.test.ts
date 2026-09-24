import { expect, test } from "bun:test";
import { buildDirectoryEntries, displayArchiveName } from "../src/lib/assets/explorer";
import type { AssetArchive, ArchiveFile } from "../src/types/asset-browser";

test("hides Everything catalog aliases without changing archive identity or song names", () => {
  const archive = {
    id: "real-id",
    key: "adv-chat-data_assets_adv-chat-data-001_tomorieverything.bundle",
    bundle_name: "opaque-hash",
  } as AssetArchive;
  const song = {
    id: "song-id",
    key: "cri_assets_cri_sound_sound_bgm_adv_everything_will_be_alright.bundle",
    bundle_name: "song-hash",
  } as AssetArchive;
  const archives = buildDirectoryEntries([archive, song], "", "", "name");
  expect(archives.map((entry) => entry.name)).toEqual([
    "adv-chat-data_assets_adv-chat-data-001_tomori.bundle",
    song.key,
  ]);
  expect(archives[0]?.id).toBe(archive.id);
  expect(archives[0]?.path).toBe(archive.key);
  expect(displayArchiveName("character-image_assets_character-image-10everythinginitialdownload.bundle"))
    .toBe("character-image_assets_character-image-10initialdownload.bundle");

  const files = [
    { key: "Everything", resource_type: "UnityEngine.TextAsset", internal: "AdvChat-Sound.txt", ambiguous: true },
    { key: "bundle.bundle", resource_type: "UnityEngine.ResourceManagement.ResourceProviders.IAssetBundleResource", internal: "bundle.bundle", ambiguous: false },
    { key: "Adv/Chat/data", resource_type: "UnityEngine.TextAsset", internal: "data.txt", ambiguous: false },
  ] as ArchiveFile[];
  expect(buildDirectoryEntries(files, "", "", "name").map((entry) => entry.name)).toEqual(["Adv"]);
  expect(buildDirectoryEntries(files, "", "Everything", "name")).toEqual([]);
});

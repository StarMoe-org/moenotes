import { GAME_SAVE_MAX_BYTES, gameSaveText, sha256Hex } from "@/lib/account/game-saves";
import { parseGameSave } from "./game-save";
import { openLinkedGameSave, type LoadedGameSave } from "./game-save-source";
import { parseBox, type CardBox } from "./model";

const BACKUP_FORMAT = "moenotes.card-box-backup/1";
const BOX_MAX_BYTES = 20_000_000;
export const BOX_BACKUP_MAX_BYTES = BOX_MAX_BYTES + Math.ceil(GAME_SAVE_MAX_BYTES / 3) * 4 + 1024;

/** Linked backups carry the exact save bytes; derived observations never enter Box storage. */
export async function exportBoxBackup(box: CardBox): Promise<string> {
  const clean = parseBox(JSON.stringify(box));
  if (!clean.save) return JSON.stringify(clean, null, 2);
  const result = await openLinkedGameSave(clean.save);
  if (result.status !== "ready") throw new Error("Linked save is unavailable for backup");
  const bytes = result.save.bytes;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return JSON.stringify({ format: BACKUP_FORMAT, box: clean, gameSave: btoa(chunks.join("")) });
}

/** Accept legacy pointer-only Boxes and portable backups. Verify all bytes before any storage write. */
export async function parseBoxBackup(text: string): Promise<{ box: CardBox; save: LoadedGameSave | null }> {
  if (new TextEncoder().encode(text).byteLength > BOX_BACKUP_MAX_BYTES) throw new Error("Backup is too large");
  const value = JSON.parse(text);
  if (value?.format !== BACKUP_FORMAT) return { box: parseBox(text), save: null };
  if (Object.keys(value).some(key => !["format", "box", "gameSave"].includes(key))) throw new Error("Invalid backup");
  const box = parseBox(JSON.stringify(value.box));
  if (!box.save || typeof value.gameSave !== "string" || value.gameSave.length > Math.ceil(GAME_SAVE_MAX_BYTES / 3) * 4
    || value.gameSave.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.gameSave)) throw new Error("Invalid backup save");
  const binary = atob(value.gameSave);
  if (binary.length > GAME_SAVE_MAX_BYTES) throw new Error("Save is too large");
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (await sha256Hex(bytes) !== box.save.sha256) throw new Error("Backup save integrity mismatch");
  const saveText = gameSaveText(bytes);
  const player = parseGameSave(saveText);
  return { box, save: { server: box.save.server, accountId: box.save.accountId, sha256: box.save.sha256, bytes, text: saveText, player } };
}

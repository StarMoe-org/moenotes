import { table, type DeckData, type Row } from './data';
import type { AccountInput, Issue } from './account';

export function accountMemory(data: DeckData, account: AccountInput, missing: Issue[], errors: Issue[]) {
  const rows = (name: string) => table(data, name);
  const raw = account.account._player._memory;
  const memory = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Row : {};
  const issue = (path: string, code: string) => (code === 'missing' ? missing : errors).push({ path, code, message: code });
  const entries = (value: unknown, path: string, key: string, valid: Set<unknown>) => {
    if (value == null) return [];
    if (!Array.isArray(value)) { issue(path, 'invalid_value'); return []; }
    const seen = new Set<unknown>();
    return value.flatMap((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { issue(`${path}[${index}]`, 'invalid_value'); return []; }
      const row = entry as Row;
      if (!Number.isInteger(row[key])) { issue(`${path}[${index}].${key}`, 'invalid_value'); return []; }
      if (!valid.has(row[key])) return [];
      if (seen.has(row[key])) { issue(`${path}[${index}].${key}`, 'duplicate_id'); return []; }
      seen.add(row[key]); return [{ row, path: `${path}[${index}]` }];
    });
  };
  const unlocked = (name: string, ownedName: string, master: string, levels: string) => {
    const path = `_player._memory.${name}`, hasLevels = rows(levels).length > 0;
    const validIds = new Set(rows(master).map(r => r.id));
    const cards = entries(memory[name], path, '_id', validIds);
    const ownedRows = account.account._player[ownedName];
    if (hasLevels && ownedRows != null && !Array.isArray(ownedRows)) issue(`_player.${ownedName}`, "invalid_value");
    const owned = new Set((Array.isArray(ownedRows) ? ownedRows as Row[] : []).map(r => r._masterId).filter(id => validIds.has(id)));
    const result: number[] = [];
    for (const { row, path: p } of cards) {
      if (row._unlocked == null) issue(`${p}._unlocked`, 'missing');
      else if (typeof row._unlocked !== 'boolean') issue(`${p}._unlocked`, 'invalid_value');
      else if (row._unlocked) {
        if (owned.has(row._id)) result.push(row._id as number);
        else if (hasLevels && account.coverage[`_player.${ownedName}`] !== 'complete') issue(`_player.${ownedName}`, 'missing');
      }
    }
    if (hasLevels && account.coverage[path] !== 'complete') {
      const listed = new Set(cards.map(c => c.row._id));
      if ([...owned].some(id => !listed.has(id)) || account.coverage[`_player.${ownedName}`] !== 'complete') issue(path, 'missing');
    }
    return result;
  };
  const members = unlocked('_members', '_memberCards', 'MasterMemberCard', 'MasterMemoryMemberLevel');
  const supports = unlocked('_supports', '_supportCards', 'MasterSupportCard', 'MasterMemorySupportLevel');
  const groups = rows('MasterMemoryMusicGroup'), musics = rows('MasterMemoryMusic');
  const selected = entries(memory._musicGroups, '_player._memory._musicGroups', '_id', new Set(groups.map(r => r.id)));
  const musicGroups = selected.flatMap(({ row, path }) => {
    const owned = entries(row._musics, `${path}._musics`, '_id', new Set(musics.map(r => r.id)));
    if (!Array.isArray(row._musics) || row._musics.length === 0) issue(`${path}._musics`, 'invalid_value');
    const ranks: number[] = [];
    for (const entry of owned) {
      if (musics.find(r => r.id === entry.row._id)!.groupId !== row._id) issue(`${entry.path}._id`, 'invalid_value');
      const rank = entry.row._unlockedScoreRank;
      if (rank == null) issue(`${entry.path}._unlockedScoreRank`, 'missing');
      else if (!Number.isInteger(rank) || Number(rank) < 0 || Number(rank) > 7) issue(`${entry.path}._unlockedScoreRank`, 'invalid_value');
      else ranks.push(Number(rank));
    }
    return [{ id: row._id as number, ranks }];
  });
  if (account.coverage['_player._memory._musicGroups'] !== 'complete') {
    const listed = new Set(selected.map(g => g.row._id));
    if (rows('MasterMemoryMusicBonus').some(r => !listed.has(r.groupId))) issue('_player._memory._musicGroups', 'missing');
  }
  const targets = new Set(rows('MasterSkillTarget').map(r => r.id));
  for (const group of groups) if (!Array.isArray(group.skillTargetIds) || group.skillTargetIds.some(id => !targets.has(id)))
    issue('MasterMemoryMusicGroup', 'unknown_target');
  return { members, supports, musicGroups };
}

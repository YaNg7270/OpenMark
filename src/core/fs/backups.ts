import { listDirectory } from './fileService';

/**
 * The version history of a document: the copies `write_text_file_atomic` keeps in
 * `<folder>/.openmark-backups/<file name>.<UTC stamp>.bak` before each save that asked for one.
 */

export const BACKUP_DIR_NAME = '.openmark-backups';

export interface BackupVersion {
  path: string;
  /** When the copy was taken — i.e. what the file looked like just before that save. */
  takenAt: Date;
  size: number;
}

/**
 * Reads the timestamp out of a backup's name, or null when the name belongs to another file.
 *
 * The prefix must be the document's own name followed by the stamp, so `notes.md.md.<stamp>.bak`
 * (the backups of `notes.md.md`) is never listed as a version of `notes.md`.
 */
export function parseBackupName(fileName: string, entryName: string): Date | null {
  if (!entryName.startsWith(`${fileName}.`) || !entryName.endsWith('.bak')) return null;
  const stamp = entryName.slice(fileName.length + 1, -'.bak'.length);
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?$/.exec(stamp);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, ms] = match;
  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number((ms ?? '0').padEnd(3, '0'))),
  );
}

function splitPath(path: string): { dir: string; name: string; separator: string } {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const separator = at !== -1 ? path[at]! : '/';
  return { dir: at === -1 ? '' : path.slice(0, at), name: path.slice(at + 1), separator };
}

/** Newest first. Empty for an unsaved document, outside the desktop shell, or with no backups. */
export async function listBackups(documentPath: string | null): Promise<BackupVersion[]> {
  if (!documentPath) return [];
  const { dir, name, separator } = splitPath(documentPath);
  const entries = await listDirectory(`${dir}${separator}${BACKUP_DIR_NAME}`);
  const versions: BackupVersion[] = [];
  for (const entry of entries) {
    if (entry.isDir) continue;
    const takenAt = parseBackupName(name, entry.name);
    if (takenAt) versions.push({ path: entry.path, takenAt, size: entry.size });
  }
  return versions.sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime());
}

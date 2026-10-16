import { describe, expect, it } from 'vitest';
import { parseBackupName } from '@/core/fs/backups';

describe('parseBackupName', () => {
  it('reads the UTC timestamp the desktop host writes', () => {
    expect(parseBackupName('notes.md', 'notes.md.20261016-073012.045.bak')?.toISOString()).toBe('2026-10-16T07:30:12.045Z');
  });

  /*
   * `notes.md.md.<stamp>.bak` starts with `notes.md.` too. Listing it as a version of
   * `notes.md` would offer another file's content as this file's history.
   */
  it('does not claim the backups of a file whose name extends this one', () => {
    expect(parseBackupName('notes.md', 'notes.md.md.20261016-073012.045.bak')).toBeNull();
    expect(parseBackupName('notes.md', 'notes.md.20261016-073012.045.tmp')).toBeNull();
    expect(parseBackupName('notes.md', 'other.md.20261016-073012.045.bak')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Autosave and the rotating backup set.
 *
 * Every save that asks for a backup adds one, and only the newest 20 per file are kept. Autosave
 * on by default writes every few seconds, so if each autosave took a backup the whole history
 * would be churned out within minutes — version history would only ever show the last minute
 * and a half. Autosaves therefore take a backup at most every ten minutes; manual saves always do.
 */

const writes = vi.hoisted(() => [] as { path: string; makeBackup: boolean | undefined }[]);

vi.mock('@/core/fs/fileService', () => ({
  writeFile: async (path: string, _text: string, options: { makeBackup?: boolean }) => {
    writes.push({ path, makeBackup: options.makeBackup });
    return { path, size: 1, mtimeMs: writes.length, backupPath: options.makeBackup ? `${path}.bak` : null };
  },
}));

const { useStore, AUTOSAVE_BACKUP_INTERVAL_MS } = await import('@/app/store');

function edit(path: string, source: string): void {
  useStore.setState((state) => ({
    doc: { ...state.doc, path, source, savedSource: '', readOnly: false, mtimeMs: null, externalChange: null },
  }));
}

describe('autosave backups', () => {
  beforeEach(() => {
    writes.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 9, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('takes a backup on the first autosave, then not again until the interval has passed', async () => {
    const path = 'C:/docs/throttle.md';
    edit(path, 'one');
    await useStore.getState().save({ auto: true });
    edit(path, 'two');
    await useStore.getState().save({ auto: true });
    vi.setSystemTime(Date.now() + AUTOSAVE_BACKUP_INTERVAL_MS);
    edit(path, 'three');
    await useStore.getState().save({ auto: true });

    expect(writes.map((w) => w.makeBackup)).toEqual([true, false, true]);
  });

  it('always takes a backup on a manual save', async () => {
    const path = 'C:/docs/manual.md';
    edit(path, 'one');
    await useStore.getState().save({ auto: true });
    edit(path, 'two');
    await useStore.getState().save();
    expect(writes.map((w) => w.makeBackup)).toEqual([true, true]);
  });

  it('marks as saved only the text that was written', async () => {
    const path = 'C:/docs/race.md';
    edit(path, 'written');
    const saving = useStore.getState().save({ auto: true });
    // Typing continues while the write is in flight.
    useStore.setState((state) => ({ doc: { ...state.doc, source: 'written and more' } }));
    await saving;
    const { doc } = useStore.getState();
    expect(doc.savedSource).toBe('written');
    expect(doc.source).not.toBe(doc.savedSource);
  });
});

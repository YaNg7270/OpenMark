import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Stat {
  exists: boolean;
  size: number;
  mtimeMs: number;
  isDir: boolean;
}

/**
 * The probe's verdict depends on what happens *while it is in flight* — an autosave can land, or
 * the user can switch documents — so these tests hold the probe open and mutate the store from
 * underneath it. That interleaving is the only way to reach the false-banner path.
 *
 * `statFile` returns a promise the test resolves explicitly, so the ordering is exact and no
 * test waits on the clock.
 */
const probe = vi.hoisted(() => ({
  gate: null as null | { promise: Promise<Stat | null>; resolve: (value: Stat | null) => void },
  calls: [] as string[],
}));

vi.mock('@/core/fs/fileService', () => ({
  statFile: (path: string) => {
    probe.calls.push(path);
    const gate = Promise.withResolvers<Stat | null>();
    probe.gate = gate;
    return gate.promise;
  },
}));

const { useStore } = await import('@/app/store');

/** Resolves the in-flight probe with `result`, then waits for the store's continuation. */
async function finish(check: Promise<void>, result: Stat | null): Promise<void> {
  if (!probe.gate) throw new Error('no probe was in flight');
  probe.gate.resolve(result);
  await check;
}

const CHANGED: Stat = { exists: true, size: 10, mtimeMs: 2_000, isDir: false };

describe('external change detection', () => {
  beforeEach(() => {
    probe.gate = null;
    probe.calls = [];
    useStore.setState((state) => ({
      doc: { ...state.doc, path: 'C:/docs/a.md', mtimeMs: 1_000, externalChange: null },
    }));
  });

  it('reports a change when the file really moved on', async () => {
    const check = useStore.getState().checkExternalChange();
    await finish(check, CHANGED);
    expect(useStore.getState().doc.externalChange).toEqual({ mtimeMs: 2_000 });
  });

  it('stays quiet when our own save lands while the probe is in flight', async () => {
    // The file's mtime moves because *we* wrote it, and `save()` records the mtime the write
    // returned before the probe resumes — so the new value is expected, not external.
    const check = useStore.getState().checkExternalChange();
    useStore.setState((state) => ({ doc: { ...state.doc, mtimeMs: 2_000 } }));
    await finish(check, CHANGED);
    expect(useStore.getState().doc.externalChange).toBeNull();
  });

  it('does not blame a document that was opened while the probe was in flight', async () => {
    const check = useStore.getState().checkExternalChange();
    // The user switched tabs mid-probe: the result belongs to the previous document.
    useStore.setState((state) => ({
      doc: { ...state.doc, path: 'C:/docs/b.md', mtimeMs: 5_000, externalChange: null },
    }));
    await finish(check, { ...CHANGED, mtimeMs: 999_999 });
    expect(useStore.getState().doc.externalChange).toBeNull();
    expect(probe.calls).toEqual(['C:/docs/a.md']);
  });

  it('leaves a clean document alone when the mtime is unchanged', async () => {
    const check = useStore.getState().checkExternalChange();
    await finish(check, { ...CHANGED, mtimeMs: 1_000 });
    expect(useStore.getState().doc.externalChange).toBeNull();
  });

  it('does nothing for an unsaved document', async () => {
    useStore.setState((state) => ({ doc: { ...state.doc, path: null, mtimeMs: null } }));
    await useStore.getState().checkExternalChange();
    expect(probe.calls).toEqual([]);
  });

  it('treats a deleted file as absent rather than as a change', async () => {
    // A missing file is handled by the write path, which recreates it, and by the health check.
    // The banner is specifically about *another program* having edited the document.
    const check = useStore.getState().checkExternalChange();
    await finish(check, null);
    expect(useStore.getState().doc.externalChange).toBeNull();
  });
});

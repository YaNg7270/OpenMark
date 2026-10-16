import { describe, expect, it } from 'vitest';
import { collectDrafts, draftId, type Draft, type JournalDocument } from '@/app/drafts';

function doc(overrides: Partial<JournalDocument>): JournalDocument {
  return {
    tabId: 'tab-1',
    path: 'C:/docs/a.md',
    name: 'a.md',
    source: 'edited',
    savedSource: 'original',
    savedHash: 'h-original',
    ...overrides,
  };
}

function draft(overrides: Partial<Draft>): Draft {
  return {
    id: 'file:C:/docs/old.md',
    path: 'C:/docs/old.md',
    name: 'old.md',
    source: 'old text',
    basisHash: 'h',
    updatedAt: 1,
    ...overrides,
  };
}

describe('collectDrafts', () => {
  it('journals only documents with unsaved changes', () => {
    const drafts = collectDrafts([doc({}), doc({ tabId: 'tab-2', path: 'C:/docs/b.md', source: 'same', savedSource: 'same' })], [], [], 100);
    expect(drafts.map((d) => d.id)).toEqual(['file:C:/docs/a.md']);
    expect(drafts[0]).toMatchObject({ source: 'edited', basisHash: 'h-original', updatedAt: 100 });
  });

  /*
   * A draft from the previous session that the user has not dealt with yet must stay in the
   * journal. Otherwise a second crash — before the user answers the recovery prompt — would
   * delete the only copy.
   */
  it('keeps unanswered drafts from the previous session', () => {
    const pending = [draft({})];
    expect(collectDrafts([], pending, [], 100)).toEqual(pending);
  });

  it('lets an open document replace the pending draft of the same file', () => {
    const pending = [draft({ id: 'file:C:/docs/a.md', path: 'C:/docs/a.md', source: 'older' })];
    const drafts = collectDrafts([doc({})], pending, [], 100);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.source).toBe('edited');
  });

  it('keeps the timestamp when the text has not changed since the last write', () => {
    const first = collectDrafts([doc({})], [], [], 100);
    const second = collectDrafts([doc({})], [], first, 200);
    expect(second[0]!.updatedAt).toBe(100);
    const third = collectDrafts([doc({ source: 'edited more' })], [], second, 300);
    expect(third[0]!.updatedAt).toBe(300);
  });
});

describe('draftId', () => {
  /*
   * Tab ids restart at `tab-1` on every launch. Without the per-launch token an untitled
   * document in this session would take the id of an untitled draft from the last one, and
   * the journal would overwrite the draft the user has not recovered yet.
   */
  it('scopes untitled documents to the launch that created them', () => {
    const untitled = { path: null, tabId: 'tab-1' };
    expect(draftId(untitled, 'run-a')).not.toBe(draftId(untitled, 'run-b'));
    expect(draftId({ path: 'C:/a.md', tabId: 'tab-1' }, 'run-a')).toBe('file:C:/a.md');
  });
});

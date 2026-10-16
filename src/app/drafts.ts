/**
 * Crash recovery: a journal of unsaved work.
 *
 * Every document with unsaved changes — the active one and every parked tab — is copied into
 * this journal shortly after it changes, and removed again once it is saved or deliberately
 * discarded. A journal that still holds entries when the app starts therefore means the
 * previous session ended with work that never reached disk (a crash, a killed process, a
 * power cut), and those entries are offered back to the user.
 *
 * The `.openmark-backups` folder does not cover this: it holds copies of what was on disk
 * *before* a save, so it can only ever give back work that had already been saved once.
 *
 * Kept in `localStorage`, like the session, which WebView2 stores in the application's own
 * user-data folder. Its quota is a few megabytes, so a write can fail for a very large
 * document; `saveDrafts` reports that rather than throwing, and the caller tells the user.
 */

const STORAGE_KEY = 'openmark.drafts.v1';

export interface Draft {
  /** `file:<path>` for a saved document, `untitled:<session>:<tab>` for one never saved. */
  id: string;
  path: string | null;
  name: string;
  /** The unsaved text, with the document's own line endings. */
  source: string;
  /**
   * Hash of what was on disk when the edits began, so recovery can tell whether the file has
   * since changed underneath the draft.
   */
  basisHash: string;
  /** Milliseconds since the epoch of the last change captured. */
  updatedAt: number;
}

/** What the journal needs to know about one open document. */
export interface JournalDocument {
  tabId: string;
  path: string | null;
  name: string;
  source: string;
  savedSource: string;
  savedHash: string;
}

/**
 * A per-launch token, so an untitled document from this session can never take the id of an
 * unrecovered untitled draft from the last one — tab ids restart at `tab-1` on every launch.
 */
export const SESSION_TOKEN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function draftId(doc: Pick<JournalDocument, 'path' | 'tabId'>, session = SESSION_TOKEN): string {
  return doc.path ? `file:${doc.path}` : `untitled:${session}:${doc.tabId}`;
}

/**
 * The journal contents for the current state: every dirty open document, plus every draft from
 * a previous session that the user has neither restored nor discarded yet. Dropping the latter
 * would lose them for good if this session crashed too.
 */
export function collectDrafts(
  open: readonly JournalDocument[],
  pending: readonly Draft[],
  previous: readonly Draft[],
  now: number,
): Draft[] {
  const current: Draft[] = [];
  for (const doc of open) {
    if (doc.source === doc.savedSource) continue;
    const id = draftId(doc);
    const before = previous.find((draft) => draft.id === id);
    // Keep the old timestamp when nothing changed, so the journal is not rewritten for nothing.
    const updatedAt = before && before.source === doc.source ? before.updatedAt : now;
    current.push({ id, path: doc.path, name: doc.name, source: doc.source, basisHash: doc.savedHash, updatedAt });
  }
  const taken = new Set(current.map((draft) => draft.id));
  return [...pending.filter((draft) => !taken.has(draft.id)), ...current];
}

export function sameDrafts(a: readonly Draft[], b: readonly Draft[]): boolean {
  return (
    a.length === b.length &&
    a.every((draft, i) => draft.id === b[i]?.id && draft.updatedAt === b[i]?.updatedAt && draft.source === b[i]?.source)
  );
}

export function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(readDraft);
  } catch {
    return [];
  }
}

/** Returns false when storage refused the write (quota, private mode). */
export function saveDrafts(drafts: readonly Draft[]): boolean {
  try {
    if (drafts.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

function readDraft(value: unknown): Draft[] {
  if (typeof value !== 'object' || value === null) return [];
  const v = value as Record<string, unknown>;
  if (typeof v['id'] !== 'string' || typeof v['source'] !== 'string' || typeof v['name'] !== 'string') return [];
  return [
    {
      id: v['id'],
      path: typeof v['path'] === 'string' ? v['path'] : null,
      name: v['name'],
      source: v['source'],
      basisHash: typeof v['basisHash'] === 'string' ? v['basisHash'] : '',
      updatedAt: typeof v['updatedAt'] === 'number' ? v['updatedAt'] : 0,
    },
  ];
}

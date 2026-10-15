/**
 * Session state: which files were open recently, and where the reader had got to in each.
 *
 * Kept in `localStorage`, which WebView2 stores in the application's own user-data folder —
 * so it survives restarts in the packaged app and works unchanged in a browser.
 *
 * Positions are stored **per file path** and keyed by a content hash as well, because a
 * scroll offset is meaningless if the document has since changed: restoring a pixel offset
 * into an edited document would drop the reader somewhere unrelated. When the hash differs
 * the stored *heading* is used instead, which is the nearest thing to a semantic bookmark
 * that survives editing above the reader's position.
 */

import { isFiniteNumber, isNonEmptyString, isPlainObject } from '@/core/util/guards';

const STORAGE_KEY = 'openmark.session.v1';

/** How many files to remember. Enough to cover a working session without unbounded growth. */
const MAX_RECENT = 40;

export interface RecentFile {
  path: string;
  name: string;
  /** Epoch milliseconds of the most recent open. */
  openedAt: number;
}

export interface ReadingPosition {
  /** Pixel offset in the scrolling container. */
  scrollTop: number;
  /** Fraction of the document read, used when the layout changed but the text did not. */
  progress: number;
  /** Anchor heading id, used as a fallback when the document was edited. */
  headingId: string | null;
  /** Content hash at the time the position was recorded. */
  hash: string;
  updatedAt: number;
}

export interface SessionState {
  version: 1;
  recent: RecentFile[];
  positions: Record<string, ReadingPosition>;
}

const EMPTY: SessionState = { version: 1, recent: [], positions: {} };

export function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return {
      version: 1,
      recent: Array.isArray(parsed.recent) ? parsed.recent.flatMap(readRecentFile).slice(0, MAX_RECENT) : [],
      positions: isPlainObject(parsed.positions) ? readPositions(parsed.positions) : {},
    };
  } catch {
    return EMPTY;
  }
}

export function saveSession(state: SessionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (quota, private mode). Losing session state is preferable
    // to blocking the app.
  }
}

/**
 * Records that a file was opened, moving it to the front of the list.
 * The most recent entry is always first, so callers can render the list directly.
 */
export function withRecentFile(state: SessionState, file: { path: string; name: string }): SessionState {
  const recent = [
    { path: file.path, name: file.name, openedAt: Date.now() },
    ...state.recent.filter((entry) => entry.path !== file.path),
  ].slice(0, MAX_RECENT);
  return { ...state, recent };
}

export function withReadingPosition(
  state: SessionState,
  path: string,
  position: ReadingPosition,
): SessionState {
  const positions = { ...state.positions, [path]: position };
  // Bound growth: keep only the positions for files still on the recent list, plus this one.
  const recentPaths = new Set(state.recent.map((entry) => entry.path));
  recentPaths.add(path);
  for (const key of Object.keys(positions)) {
    if (!recentPaths.has(key)) delete positions[key];
  }
  return { ...state, positions };
}

export function forgetFile(state: SessionState, path: string): SessionState {
  const positions = { ...state.positions };
  delete positions[path];
  return { ...state, recent: state.recent.filter((entry) => entry.path !== path), positions };
}

/**
 * Reads one persisted recent-file entry, or nothing when it is malformed.
 *
 * Returning an array rather than a boolean lets `flatMap` drop invalid entries without a
 * separate filter, and keeps the shape check next to the shape it produces.
 */
function readRecentFile(value: unknown): RecentFile[] {
  if (!isPlainObject(value)) return [];
  const { path, name } = value;
  if (!isNonEmptyString(path) || !isNonEmptyString(name)) return [];
  const openedAt = isFiniteNumber(value['openedAt']) ? value['openedAt'] : 0;
  return [{ path, name, openedAt }];
}

/**
 * Reads persisted reading positions, discarding malformed entries.
 *
 * A corrupted or hand-edited entry must not be trusted: a non-finite `scrollTop` would put
 * the reader at an unpredictable place the moment a file is opened.
 */
function readPositions(source: Record<string, unknown>): Record<string, ReadingPosition> {
  const out: Record<string, ReadingPosition> = {};
  for (const [path, value] of Object.entries(source)) {
    if (!isPlainObject(value)) continue;
    const { scrollTop, progress } = value;
    if (!isFiniteNumber(scrollTop) || scrollTop < 0) continue;
    if (!isFiniteNumber(progress)) continue;
    out[path] = {
      scrollTop,
      progress: Math.min(1, Math.max(0, progress)),
      headingId: isNonEmptyString(value['headingId']) ? value['headingId'] : null,
      hash: typeof value['hash'] === 'string' ? value['hash'] : '',
      updatedAt: isFiniteNumber(value['updatedAt']) ? value['updatedAt'] : 0,
    };
  }
  return out;
}

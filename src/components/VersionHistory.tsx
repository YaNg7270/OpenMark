import { useEffect, useState } from 'react';
import { useStore } from '@/app/store';
import { listBackups, type BackupVersion } from '@/core/fs/backups';
import { t } from '@/i18n';

/**
 * The current document's earlier versions, from its `.openmark-backups` folder.
 *
 * Each entry is the file as it was just before a save. Loading one puts its text into the
 * document as unsaved changes — nothing on disk changes until the user saves, so loading the
 * wrong version costs nothing.
 */
export function VersionHistory() {
  const path = useStore((s) => s.doc.path);
  // Re-listed after every save, which is when a new version can appear.
  const mtimeMs = useStore((s) => s.doc.mtimeMs);
  const readOnly = useStore((s) => s.doc.readOnly);
  const restoreVersion = useStore((s) => s.restoreVersion);
  const [versions, setVersions] = useState<BackupVersion[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listBackups(path).then((list) => {
      if (!cancelled) setVersions(list);
    });
    return () => {
      cancelled = true;
    };
  }, [path, mtimeMs]);

  if (!path) return null;

  return (
    <section className="om-history" data-om-testid="version-history">
      <h3 className="om-history__title">{t('history.title')}</h3>
      {versions === null ? null : versions.length === 0 ? (
        <p className="om-panel__empty">{t('history.empty')}</p>
      ) : (
        <ul className="om-history__list">
          {versions.map((version) => (
            <li key={version.path} className="om-history__item" data-om-testid="version-item">
              <span className="om-history__time">{formatLocal(version.takenAt)}</span>
              <span className="om-history__size">{formatSize(version.size)}</span>
              <button
                type="button"
                className="om-button"
                disabled={readOnly}
                data-om-testid="version-restore"
                title={version.path}
                onClick={() => void restoreVersion(version.path)}
              >
                {t('history.restore')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

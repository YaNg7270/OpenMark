import { useStore } from "@/app/store";
import { t } from "@/i18n";

/**
 * Offers back the unsaved work the previous session left in the draft journal.
 *
 * Shown until every draft is restored or discarded. It never restores anything on its own:
 * a draft may be stale, or the file may have moved on since, and only the user can tell.
 *
 * Drawn as a dialog but not modal: a file opened from Explorer arrives while this is still up,
 * and a backdrop would block the very document the reader asked for.
 */
export function DraftRecovery() {
  const drafts = useStore((s) => s.pendingDrafts);
  const restoreDraft = useStore((s) => s.restoreDraft);
  const discardDraft = useStore((s) => s.discardDraft);
  if (drafts.length === 0) return null;

  return (
    <section
      className="om-modal__panel om-modal__panel--narrow om-recovery"
      role="alertdialog"
      aria-labelledby="om-recovery-title"
      aria-describedby="om-recovery-body"
      data-om-testid="draft-recovery"
    >
      <header className="om-modal__header">
        <h2 id="om-recovery-title">{t("drafts.title")}</h2>
      </header>
      <p className="om-modal__body" id="om-recovery-body">
        {t("drafts.found", { count: String(drafts.length) })}
        {t("drafts.explain")}
      </p>
      <ul className="om-recovery__list">
        {drafts.map((draft) => (
          <li
            key={draft.id}
            className="om-recovery__item"
            data-om-testid="draft-item"
          >
            <span className="om-recovery__name" title={draft.path ?? undefined}>
              {draft.path
                ? draft.name
                : `${draft.name} ${t("drafts.untitled")}`}
              <small className="om-recovery__time">
                {formatTime(draft.updatedAt)}
              </small>
            </span>
            <button
              type="button"
              className="om-btn om-btn--secondary"
              data-om-testid="draft-discard"
              onClick={() => discardDraft(draft.id)}
            >
              {t("drafts.discard")}
            </button>
            <button
              type="button"
              className="om-btn om-btn--primary"
              data-om-testid="draft-restore"
              onClick={() => void restoreDraft(draft.id)}
            >
              {t("drafts.restore")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatTime(ms: number): string {
  if (!ms) return "";
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

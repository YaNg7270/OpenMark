import { useEffect, useId, useRef } from 'react';
import { t } from '@/i18n';

/**
 * A modal question with one destructive answer.
 *
 * Replaces `window.confirm`, which WebView2 draws as a browser-chrome box titled with the page
 * origin — the one dialog in the app that did not look like the app. The safe answer, cancel,
 * takes focus first, so Enter on arrival never discards anything; Escape and a click on the
 * backdrop also cancel.
 */
interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, testId }: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div
      className="om-modal"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="om-modal__backdrop" onClick={onCancel} />
      <div
        className="om-modal__panel om-modal__panel--narrow"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-om-testid={testId}
      >
        <header className="om-modal__header">
          <h2 id={titleId}>{title}</h2>
        </header>
        <p className="om-modal__body" id={bodyId}>
          {message}
        </p>
        <footer className="om-modal__footer">
          <span className="om-modal__hint" />
          <button type="button" className="om-btn om-btn--secondary" ref={cancelRef} onClick={onCancel}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="om-btn om-btn--primary" data-om-testid="confirm-accept" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

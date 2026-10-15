import { useCallback, useEffect, useRef, useState } from 'react';
import type { MathExpression, ParsedDocument } from '@/core/markdown/types';
import { renderExpression } from '@/core/math/mathjax';
import { useStore } from '@/app/store';
import { t } from '@/i18n';

/**
 * Formula tools: copy as LaTeX, and an edit dialog with live preview.
 *
 * Both operate on the expression registry rather than on the rendered SVG, because the
 * rendered output deliberately does not carry the source. MathJax's own SVG keeps the TeX in
 * `data-latex` attributes, but reading it back from the DOM would be fragile and would not
 * survive the `useXlink: false` serialisation used for export — the registry is the source of
 * truth, so it is what these tools use.
 *
 * The popover is positioned from the clicked element's bounding box rather than being
 * appended inline, so it can never disturb the block layout it is anchored to.
 */

interface MathToolsProps {
  rootRef: React.RefObject<HTMLElement | null>;
  render: ParsedDocument | null;
  /** Changes when a different document is opened; closes any open tool. */
  documentKey: string;
}

interface Anchor {
  top: number;
  left: number;
}

export function MathTools({ rootRef, render, documentKey }: MathToolsProps) {
  const [selected, setSelected] = useState<MathExpression | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [editing, setEditing] = useState<MathExpression | null>(null);
  const copyTimer = useRef(0);
  const [copied, setCopied] = useState(false);

  // Any change of document invalidates the selection: the expression ids refer to it.
  useEffect(() => {
    setSelected(null);
    setEditing(null);
    setAnchor(null);
  }, [documentKey]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !render) return;

    const byId = new Map(render.math.map((expr) => [expr.id, expr]));

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // The popover's own buttons must not re-trigger the selection logic.
      if (target.closest('[data-om-math-tools]')) return;

      const host = target.closest('[data-om-math]');
      if (!(host instanceof HTMLElement)) {
        setSelected(null);
        setAnchor(null);
        return;
      }
      const expr = byId.get(host.dataset['omMath'] ?? '');
      if (!expr) return;

      const box = host.getBoundingClientRect();
      setSelected(expr);
      setAnchor({
        top: box.bottom + 6,
        // Clamp so the popover stays on screen for an expression at the right edge.
        left: Math.min(Math.max(8, box.left), Math.max(8, window.innerWidth - 260)),
      });
    };

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [rootRef, render]);

  const copyLatex = useCallback(async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.tex);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      useStore.getState().notify('error', t('math.copyFailed'));
    }
  }, [selected]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  return (
    <>
      {selected && anchor && !editing && (
        <div
          className="om-math-tools"
          data-om-math-tools="1"
          data-om-testid="math-tools"
          style={{ top: anchor.top, left: anchor.left }}
          role="toolbar"
          aria-label={t('math.tools')}
        >
          <button type="button" className="om-button" onClick={() => void copyLatex()} data-om-testid="math-copy">
            {copied ? t('math.copied') : t('math.copyLatex')}
          </button>
          <button
            type="button"
            className="om-button"
            data-om-testid="math-edit"
            onClick={() => {
              setEditing(selected);
              setSelected(null);
            }}
          >
            {t('math.edit')}
          </button>
          <button
            type="button"
            className="om-icon-button"
            aria-label={t('math.close')}
            onClick={() => {
              setSelected(null);
              setAnchor(null);
            }}
          >
            ×
          </button>
        </div>
      )}

      {editing && (
        <MathEditDialog
          expression={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setAnchor(null);
          }}
        />
      )}
    </>
  );
}

interface MathEditDialogProps {
  expression: MathExpression;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal formula editor with a live preview.
 *
 * The preview runs the *same* `renderExpression` path the document uses, so what the author
 * sees is exactly what the document will contain — including the failure case. An invalid
 * formula shows MathJax's error and the source stays in the textarea, so nothing is lost.
 */
function MathEditDialog({ expression, onClose, onSaved }: MathEditDialogProps) {
  const [tex, setTex] = useState(expression.tex);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const applyMathEdit = useStore((s) => s.applyMathEdit);
  const readOnly = useStore((s) => s.doc.readOnly);

  // Re-render the preview shortly after typing stops; MathJax is fast but not free.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void renderExpression(tex, { display: expression.display, containerWidth: 640 }).then((outcome) => {
        if (cancelled) return;
        setPreview(outcome.html);
        setError(outcome.ok ? null : outcome.error.message);
      });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tex, expression.display]);

  const save = useCallback(() => {
    if (readOnly) return;
    if (applyMathEdit(expression.id, tex)) onSaved();
  }, [applyMathEdit, expression.id, onSaved, readOnly, tex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, save]);

  return (
    <div className="om-modal" role="dialog" aria-modal="true" aria-label={t('math.editTitle')} data-om-testid="math-dialog">
      <div className="om-modal__backdrop" onClick={onClose} />
      <div className="om-modal__panel">
        <header className="om-modal__header">
          <h2>{t('math.editTitle')}</h2>
          <span className="om-modal__meta">
            第 {expression.range.start.line} 行 · {delimiterLabel(expression)}
          </span>
        </header>

        <label className="om-modal__label" htmlFor="om-math-source">
          {t('math.source')}
        </label>
        <textarea
          id="om-math-source"
          className="om-modal__source"
          data-om-testid="math-dialog-source"
          value={tex}
          spellCheck={false}
          rows={Math.min(14, Math.max(3, tex.split('\n').length + 1))}
          onChange={(event) => setTex(event.target.value)}
          autoFocus
        />

        <label className="om-modal__label">{t('math.preview')}</label>
        <div
          className="om-modal__preview"
          data-om-testid="math-dialog-preview"
          data-om-state={error ? 'error' : 'ok'}
          /* Safe: MathJax output from our own renderer, never document HTML. */
          dangerouslySetInnerHTML={{ __html: preview }}
        />

        {error && (
          <p className="om-modal__error" role="alert" data-om-testid="math-dialog-error">
            {error}
          </p>
        )}

        <footer className="om-modal__footer">
          <span className="om-modal__hint">{t('math.hint')}</span>
          <button type="button" className="om-button" onClick={onClose}>
            {t('math.cancel')}
          </button>
          <button
            type="button"
            className="om-button om-button--primary"
            onClick={save}
            disabled={readOnly}
            data-om-testid="math-dialog-save"
          >
            {t('math.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function delimiterLabel(expression: MathExpression): string {
  switch (expression.delimiter) {
    case 'dollar':
      return '$ … $';
    case 'dollar-block':
      return '$$ … $$';
    case 'paren-inline':
      return '\\( … \\)';
    case 'paren-block':
      return '\\[ … \\]';
    case 'math-fence':
      return '```math';
    case 'latex-env':
      return `\\begin{${expression.environment ?? 'env'}}`;
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addColumn,
  addRow,
  parseTable,
  removeColumn,
  removeRow,
  serializeTable,
  tablesEqual,
  type ColumnAlignment,
  type TableModel,
} from '@/core/markdown/table';
import { t } from '@/i18n';

/**
 * Table editor.
 *
 * Opens from a table block in instant mode and edits the table as a grid. The result is
 * written back through the same block-splice path every other instant-mode edit uses, so the
 * rest of the document cannot be affected.
 *
 * ## Not writing when nothing changed
 *
 * Serialising normalises pipe padding, so writing back unconditionally would rewrite a table
 * the author merely looked at — turning one open-and-close into a whole-block diff. The model
 * is therefore compared against the one that was loaded, and nothing is written unless an edit
 * actually happened.
 */

interface TableEditorProps {
  /** The table block's source text, exactly as it appears in the document. */
  source: string;
  onClose: () => void;
  /** Receives the serialised table. Never called when the model is unchanged. */
  onSave: (next: string) => void;
}

const ALIGNMENTS: { value: ColumnAlignment; label: string; glyph: string }[] = [
  { value: 'none', label: '默认', glyph: '—' },
  { value: 'left', label: '左对齐', glyph: '⯇' },
  { value: 'center', label: '居中', glyph: '≡' },
  { value: 'right', label: '右对齐', glyph: '⯈' },
];

export function TableEditor({ source, onClose, onSave }: TableEditorProps) {
  const original = useMemo(() => parseTable(source), [source]);
  const [model, setModel] = useState<TableModel | null>(original);

  useEffect(() => {
    setModel(original);
  }, [original]);

  const dirty = model !== null && original !== null && !tablesEqual(model, original);

  const save = useCallback(() => {
    if (!model) return;
    // An unchanged model writes nothing: opening a table must not be a modification.
    if (original && tablesEqual(model, original)) {
      onClose();
      return;
    }
    onSave(serializeTable(model));
  }, [model, onClose, onSave, original]);

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

  if (!model) {
    return (
      <div className="om-modal" role="dialog" aria-modal="true" data-om-testid="table-dialog">
        <div className="om-modal__backdrop" onClick={onClose} />
        <div className="om-modal__panel">
          <p className="om-modal__error" role="alert">
            {t('table.unparseable')}
          </p>
          <footer className="om-modal__footer">
            <button type="button" className="om-button" onClick={onClose}>
              {t('math.cancel')}
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="om-modal" role="dialog" aria-modal="true" aria-label={t('table.editTitle')} data-om-testid="table-dialog">
      <div className="om-modal__backdrop" onClick={onClose} />
      <div className="om-modal__panel om-modal__panel--wide">
        <header className="om-modal__header">
          <h2>{t('table.editTitle')}</h2>
          <span className="om-modal__meta">
            {model.headers.length} × {model.rows.length + 1}
          </span>
        </header>

        <div className="om-table-editor">
          <table>
            <thead>
              <tr>
                {model.headers.map((cell, index) => (
                  <th key={index}>
                    <input
                      type="text"
                      value={cell}
                      aria-label={`${t('table.column')} ${index + 1}`}
                      data-om-testid={`table-header-${index}`}
                      onChange={(event) =>
                        setModel((current) => {
                          if (!current) return current;
                          const headers = [...current.headers];
                          headers[index] = event.target.value;
                          return { ...current, headers };
                        })
                      }
                    />
                    <select
                      className="om-table-editor__align"
                      value={model.alignments[index] ?? 'none'}
                      aria-label={`${t('table.alignment')} ${index + 1}`}
                      onChange={(event) =>
                        setModel((current) => {
                          if (!current) return current;
                          const alignments = [...current.alignments];
                          alignments[index] = event.target.value as ColumnAlignment;
                          return { ...current, alignments };
                        })
                      }
                    >
                      {ALIGNMENTS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.glyph} {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="om-icon-button om-table-editor__remove"
                      title={t('table.removeColumn')}
                      aria-label={`${t('table.removeColumn')} ${index + 1}`}
                      disabled={model.headers.length <= 1}
                      onClick={() => setModel((current) => (current ? removeColumn(current, index) : current))}
                    >
                      ×
                    </button>
                  </th>
                ))}
                <th className="om-table-editor__spacer">
                  <button
                    type="button"
                    className="om-icon-button"
                    title={t('table.addColumn')}
                    data-om-testid="table-add-column"
                    onClick={() => setModel((current) => (current ? addColumn(current) : current))}
                  >
                    +
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, columnIndex) => (
                    <td key={columnIndex}>
                      <input
                        type="text"
                        value={cell}
                        aria-label={`${t('table.cell')} ${rowIndex + 1},${columnIndex + 1}`}
                        data-om-testid={`table-cell-${rowIndex}-${columnIndex}`}
                        onChange={(event) =>
                          setModel((current) => {
                            if (!current) return current;
                            const rows = current.rows.map((existing, index) =>
                              index === rowIndex
                                ? existing.map((value, cellIndex) =>
                                    cellIndex === columnIndex ? event.target.value : value,
                                  )
                                : existing,
                            );
                            return { ...current, rows };
                          })
                        }
                      />
                    </td>
                  ))}
                  <td className="om-table-editor__spacer">
                    <button
                      type="button"
                      className="om-icon-button om-table-editor__remove"
                      title={t('table.removeRow')}
                      aria-label={`${t('table.removeRow')} ${rowIndex + 1}`}
                      disabled={model.rows.length <= 1}
                      onClick={() => setModel((current) => (current ? removeRow(current, rowIndex) : current))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={model.headers.length + 1}>
                  <button
                    type="button"
                    className="om-button"
                    data-om-testid="table-add-row"
                    onClick={() => setModel((current) => (current ? addRow(current) : current))}
                  >
                    {t('table.addRow')}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer className="om-modal__footer">
          <span className="om-modal__hint">
            {dirty ? t('table.changed') : t('table.unchanged')} · {t('math.hint')}
          </span>
          <button type="button" className="om-button" onClick={onClose}>
            {t('math.cancel')}
          </button>
          <button type="button" className="om-button om-button--primary" onClick={save} data-om-testid="table-save">
            {t('math.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}

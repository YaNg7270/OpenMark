import { useMemo } from 'react';
import type { Diagnostic } from '@/core/markdown/types';
import { useStore } from '@/app/store';
import { t } from '@/i18n';

/**
 * Compatibility and health diagnostics.
 *
 * Each entry is actionable: it names the line, explains why the construct could not be
 * handled, and shows the offending source. Clicking one jumps to that place in the
 * document. Nothing here is decorative — every row comes from a real check in
 * `core/markdown/engine.ts` or a real MathJax/Mermaid failure reported by the typesetter.
 */

interface DiagnosticsPanelProps {
  diagnostics: readonly Diagnostic[];
  onSelect: (diagnostic: Diagnostic) => void;
}

const SEVERITY_LABEL: Record<Diagnostic['severity'], string> = {
  error: '错误',
  warning: '警告',
  info: '提示',
};

const SOURCE_LABEL: Record<Diagnostic['source'], string> = {
  markdown: 'Markdown',
  math: 'LaTeX',
  mermaid: 'Mermaid',
  asset: '资源',
  encoding: '编码',
};

export function DiagnosticsPanel({ diagnostics, onSelect }: DiagnosticsPanelProps) {
  const counts = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    for (const d of diagnostics) {
      if (d.severity === 'error') errors++;
      else if (d.severity === 'warning') warnings++;
    }
    return { errors, warnings };
  }, [diagnostics]);

  const copyReport = useStore((s) => s.copyHealthReport);
  const exportReport = useStore((s) => s.exportHealthReport);
  const actions = (
    <div className="om-diagnostics__actions">
      <button type="button" className="om-btn om-btn--secondary om-btn--sm" data-om-testid="report-copy" onClick={() => void copyReport()}>
        {t('panel.diagnostics.copyReport')}
      </button>
      <button type="button" className="om-btn om-btn--ghost om-btn--sm" data-om-testid="report-export" onClick={() => void exportReport()}>
        {t('panel.diagnostics.exportReport')}
      </button>
    </div>
  );

  if (diagnostics.length === 0) {
    return (
      <>
        <p className="om-panel__empty">{t('panel.diagnostics.empty')}</p>
        {actions}
      </>
    );
  }

  return (
    <div className="om-diagnostics">
      {/* The two counts set as display figures: the first thing to read is how bad it is. */}
      <p className="om-diagnostics__summary" data-om-testid="diagnostics-summary">
        <span>
          <b>{counts.errors}</b> {t('panel.diagnostics.errors')}
        </span>
        <span>
          <b>{counts.warnings}</b> {t('panel.diagnostics.warnings')}
        </span>
      </p>
      <ul className="om-diagnostics__list">
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}-${diagnostic.range.start.offset}-${index}`}>
            <button
              type="button"
              className="om-diagnostic"
              data-severity={diagnostic.severity}
              data-code={diagnostic.code}
              onClick={() => onSelect(diagnostic)}
            >
              <span className="om-diagnostic__head">
                <span className="om-diagnostic__badge">{SEVERITY_LABEL[diagnostic.severity]}</span>
                <span className="om-diagnostic__source">{SOURCE_LABEL[diagnostic.source]}</span>
                <span className="om-diagnostic__line">第 {diagnostic.range.start.line} 行</span>
              </span>
              <span className="om-diagnostic__message">{diagnostic.message}</span>
              {diagnostic.detail && <span className="om-diagnostic__detail">{diagnostic.detail}</span>}
              {diagnostic.excerpt && <code className="om-diagnostic__excerpt">{diagnostic.excerpt}</code>}
            </button>
          </li>
        ))}
      </ul>
      {actions}
    </div>
  );
}

import { describe, expect, it } from 'vitest';
import { formatHealthReport } from '@/core/diagnostics/report';
import { createEngine, parseDocument } from '@/core/markdown/engine';
import type { Diagnostic } from '@/core/markdown/types';

function diagnostic(overrides: Partial<Diagnostic> & { line: number }): Diagnostic {
  const { line, ...rest } = overrides;
  const at = { line, column: 1, offset: 0 };
  return { code: 'unclosed-fence', severity: 'warning', message: 'm', source: 'markdown', range: { start: at, end: at }, ...rest };
}

const base = { name: 'a.md', path: 'C:/docs/a.md', generatedAt: new Date(2026, 9, 16, 9, 5), language: 'zh' as const };

describe('formatHealthReport', () => {
  it('lists problems in document order, most severe first on a line', () => {
    const report = formatHealthReport({
      ...base,
      diagnostics: [
        diagnostic({ line: 9, message: 'late' }),
        diagnostic({ line: 2, severity: 'info', message: 'note' }),
        diagnostic({ line: 2, severity: 'error', message: 'bad' }),
      ],
    });
    const rows = report.split('\n').filter((line) => /^\| \d/.test(line));
    expect(rows.map((row) => row.split(' | ')[4])).toEqual(['bad', 'note', 'late']);
    expect(report).toContain('1 个错误 · 1 个警告 · 1 条提示');
    expect(report).toContain('2026-10-16 09:05');
  });

  it('keeps a table intact when a message or excerpt contains pipes, backticks or newlines', () => {
    const report = formatHealthReport({
      ...base,
      diagnostics: [diagnostic({ line: 1, message: 'a | b\nc', excerpt: '| x | `y` |' })],
    });
    const row = report.split('\n').find((line) => line.startsWith('| 1 '))!;
    // Six cells: the escaped pipes inside a cell must not create new columns.
    expect(row.split(/(?<!\\)\|/).length - 2).toBe(6);
    expect(row).not.toContain('\n');
  });

  /*
   * The report is Markdown, so it must survive this app's own parser as a table with one row
   * per diagnostic — otherwise "renders anywhere Markdown does" is not true.
   */
  it('parses back as a table with one row per diagnostic', () => {
    const report = formatHealthReport({
      ...base,
      diagnostics: [diagnostic({ line: 1, message: 'x|y' }), diagnostic({ line: 3 })],
    });
    const html = parseDocument(report, createEngine()).html;
    expect(html.match(/<tr>/g)).toHaveLength(3);
  });

  it('says so when there is nothing to report', () => {
    expect(formatHealthReport({ ...base, diagnostics: [], language: 'en' })).toContain('No problems found.');
  });
});

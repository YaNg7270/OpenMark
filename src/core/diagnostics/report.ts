import type { Diagnostic } from '../markdown/types';

/**
 * The document health report: the diagnostics panel as a Markdown document that can be copied
 * into an issue, sent to a co-author, or kept next to the file.
 *
 * Plain Markdown on purpose — it reads as text in an email and renders as a table anywhere
 * Markdown does, including in this app. Each row carries the line, so the reader of the report
 * can find the problem without the app.
 */

export interface HealthReportInput {
  name: string;
  path: string | null;
  generatedAt: Date;
  diagnostics: readonly Diagnostic[];
  language: 'zh' | 'en';
}

const LABELS = {
  zh: {
    title: '文档健康报告',
    file: '文件',
    unsaved: '（未保存）',
    generated: '生成时间',
    summary: (e: number, w: number, i: number) => `${e} 个错误 · ${w} 个警告 · ${i} 条提示`,
    none: '未发现问题。',
    columns: ['行', '级别', '来源', '代码', '说明', '源码'],
    severity: { error: '错误', warning: '警告', info: '提示' },
  },
  en: {
    title: 'Document health report',
    file: 'File',
    unsaved: '(unsaved)',
    generated: 'Generated',
    summary: (e: number, w: number, i: number) => `${e} errors · ${w} warnings · ${i} notes`,
    none: 'No problems found.',
    columns: ['Line', 'Severity', 'Source', 'Code', 'Message', 'Source text'],
    severity: { error: 'error', warning: 'warning', info: 'note' },
  },
} as const;

const SEVERITY_ORDER: Record<Diagnostic['severity'], number> = { error: 0, warning: 1, info: 2 };

export function formatHealthReport(input: HealthReportInput): string {
  const l = LABELS[input.language];
  const counts = { error: 0, warning: 0, info: 0 };
  for (const d of input.diagnostics) counts[d.severity]++;

  // Document order, most severe first on the same line: the order the author will fix them in.
  const rows = [...input.diagnostics].sort(
    (a, b) => a.range.start.line - b.range.start.line || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const lines = [
    `# ${l.title}`,
    '',
    `- ${l.file}: ${cell(input.path ?? `${input.name} ${l.unsaved}`)}`,
    `- ${l.generated}: ${formatDate(input.generatedAt)}`,
    `- ${l.summary(counts.error, counts.warning, counts.info)}`,
    '',
  ];
  if (rows.length === 0) {
    lines.push(l.none, '');
    return lines.join('\n');
  }

  lines.push(`| ${l.columns.join(' | ')} |`, `| ${l.columns.map(() => '---').join(' | ')} |`);
  for (const d of rows) {
    const message = d.detail ? `${d.message} — ${d.detail}` : d.message;
    const excerpt = d.excerpt ? `\`${d.excerpt.replace(/`/g, "'")}\`` : '';
    lines.push(
      `| ${d.range.start.line} | ${l.severity[d.severity]} | ${d.source} | ${d.code} | ${cell(message)} | ${cell(excerpt)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** Makes text safe inside a table cell: no pipes, no line breaks. */
function cell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

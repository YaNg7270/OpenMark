/**
 * Bilingual UI strings.
 *
 * Chinese is the primary language; English is a first-class alternative rather than a
 * fallback. Keys are flat and dotted so a missing translation is obvious in review, and
 * `t()` falls back to the key itself rather than to an empty string — a missing string
 * should be visible, not invisible.
 */

export type UiLanguage = 'zh' | 'en';

type Dict = Record<string, string>;

const zh: Dict = {
  'app.name': 'OpenMark',
  'mode.read': '阅读模式',
  'mode.instant': '即时渲染',
  'mode.source': '源码模式',
  'mode.split': '分屏模式',
  'toolbar.open': '打开',
  'toolbar.save': '保存',
  'toolbar.saveAs': '另存为',
  'toolbar.outline': '大纲',
  'toolbar.search': '搜索',
  'toolbar.diagnostics': '诊断',
  'toolbar.settings': '设置',
  'toolbar.theme.light': '浅色',
  'toolbar.theme.dark': '深色',
  'toolbar.theme.system': '跟随系统',
  'toolbar.focus': '专注模式',
  'toolbar.readOnly': '安全只读',
  'panel.outline': '大纲',
  'panel.outline.empty': '当前文档没有标题。',
  'panel.search': '搜索',
  'panel.search.placeholder': '在文档中查找…',
  'panel.search.empty': '输入关键词开始查找。',
  'panel.search.none': '未找到匹配项。',
  'panel.search.count': '共 {n} 处匹配',
  'panel.diagnostics': '诊断',
  'panel.diagnostics.empty': '未发现问题。',
  'panel.diagnostics.summary': '{errors} 个错误 · {warnings} 个警告',
  'panel.settings': '设置',
  'panel.recent': '最近打开',
  'panel.recent.empty': '还没有打开过文件。',
  'panel.recent.forget': '从列表移除',
  'toolbar.recent': '最近打开',
  'settings.reading': '阅读外观',
  'settings.fontSize': '字号',
  'settings.lineHeight': '行距',
  'settings.contentWidth': '页面宽度',
  'settings.density': '排版密度',
  'settings.mathScale': '公式缩放',
  'settings.imageScale': '图片缩放',
  'settings.font': '正文字体',
  'settings.font.serif': '衬线',
  'settings.font.sans': '无衬线',
  'settings.font.system': '系统',
  'settings.justify': '两端对齐',
  'settings.hyphenate': '自动断词',
  'settings.numberHeadings': '标题自动编号',
  'settings.progress': '显示阅读进度',
  'settings.behaviour': '行为',
  'settings.autoSave': '自动保存',
  'settings.keepBackups': '保存时保留备份',
  'settings.safeReadOnly': '复杂文件使用安全只读模式',
  'settings.language': '界面语言',
  'settings.reset': '恢复默认设置',
  'status.lines': '行',
  'status.words': '字',
  'status.readingTime': '{n} 分钟',
  'status.math': '公式',
  'status.unsaved': '未保存',
  'status.saved': '已保存',
  'status.readOnlyReason': '只读：{reason}',
  'notice.externalChange': '文件已被其他程序修改。',
  'notice.reload': '重新载入',
  'notice.keepMine': '保留当前内容',
  'error.openFailed': '无法打开文件',
  'drop.hint': '松开以打开文件',
};

const en: Dict = {
  'app.name': 'OpenMark',
  'mode.read': 'Read',
  'mode.instant': 'Live preview',
  'mode.source': 'Source',
  'mode.split': 'Split',
  'toolbar.open': 'Open',
  'toolbar.save': 'Save',
  'toolbar.saveAs': 'Save as',
  'toolbar.outline': 'Outline',
  'toolbar.search': 'Search',
  'toolbar.diagnostics': 'Diagnostics',
  'toolbar.settings': 'Settings',
  'toolbar.theme.light': 'Light',
  'toolbar.theme.dark': 'Dark',
  'toolbar.theme.system': 'System',
  'toolbar.focus': 'Focus mode',
  'toolbar.readOnly': 'Safe read-only',
  'panel.outline': 'Outline',
  'panel.outline.empty': 'This document has no headings.',
  'panel.search': 'Search',
  'panel.search.placeholder': 'Find in document…',
  'panel.search.empty': 'Type to search.',
  'panel.search.none': 'No matches.',
  'panel.search.count': '{n} matches',
  'panel.diagnostics': 'Diagnostics',
  'panel.diagnostics.empty': 'No problems found.',
  'panel.diagnostics.summary': '{errors} errors · {warnings} warnings',
  'panel.settings': 'Settings',
  'panel.recent': 'Recent',
  'panel.recent.empty': 'No files opened yet.',
  'panel.recent.forget': 'Remove from list',
  'toolbar.recent': 'Recent files',
  'settings.reading': 'Reading appearance',
  'settings.fontSize': 'Font size',
  'settings.lineHeight': 'Line height',
  'settings.contentWidth': 'Page width',
  'settings.density': 'Density',
  'settings.mathScale': 'Formula scale',
  'settings.imageScale': 'Image scale',
  'settings.font': 'Body font',
  'settings.font.serif': 'Serif',
  'settings.font.sans': 'Sans',
  'settings.font.system': 'System',
  'settings.justify': 'Justify text',
  'settings.hyphenate': 'Hyphenate',
  'settings.numberHeadings': 'Number headings',
  'settings.progress': 'Show reading progress',
  'settings.behaviour': 'Behaviour',
  'settings.autoSave': 'Auto save',
  'settings.keepBackups': 'Keep backups on save',
  'settings.safeReadOnly': 'Safe read-only for complex files',
  'settings.language': 'Interface language',
  'settings.reset': 'Restore defaults',
  'status.lines': 'lines',
  'status.words': 'words',
  'status.readingTime': '{n} min read',
  'status.math': 'formulas',
  'status.unsaved': 'Unsaved',
  'status.saved': 'Saved',
  'status.readOnlyReason': 'Read-only: {reason}',
  'notice.externalChange': 'This file was changed by another program.',
  'notice.reload': 'Reload',
  'notice.keepMine': 'Keep mine',
  'error.openFailed': 'Could not open the file',
  'drop.hint': 'Drop to open',
};

const DICTIONARIES: Record<UiLanguage, Dict> = { zh, en };

let current: UiLanguage = 'zh';

export function setLanguage(language: UiLanguage): void {
  current = language;
}

export function getLanguage(): UiLanguage {
  return current;
}

/** Translates `key`, substituting `{name}` placeholders. Returns the key when unknown. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = DICTIONARIES[current][key] ?? DICTIONARIES.zh[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

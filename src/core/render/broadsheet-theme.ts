import type { ThemeRegistration } from 'shiki/core';

/**
 * The light syntax theme, set in Broadsheet's inks.
 *
 * Three voices and no more: cyan for the language's own words (keywords, tags, functions),
 * magenta for what the programmer wrote down (strings, numbers, constants), and a grey italic
 * for comments — the same restraint the rest of the page keeps with its two spot colours.
 *
 * It exists for contrast as much as for looks. GitHub Light was drawn for a white ground; on
 * Broadsheet's paper its red keyword token measured 3.77:1. Every colour here is a deep ramp
 * step that clears 4.5:1 against the code block's fill (#eae9e9) at body size.
 */
export const BROADSHEET_LIGHT: ThemeRegistration = {
  name: 'openmark-broadsheet',
  type: 'light',
  colors: {
    'editor.background': '#eae9e9',
    'editor.foreground': '#201e1d',
  },
  tokenColors: [
    { settings: { foreground: '#201e1d' } },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: '#605d5d', fontStyle: 'italic' },
    },
    {
      scope: [
        'keyword',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.operator.new',
        'keyword.operator.expression',
        'keyword.operator.logical.python',
        'entity.name.tag',
        'markup.heading',
        'markup.inserted',
      ],
      settings: { foreground: '#006786' },
    },
    {
      scope: ['entity.name.function', 'support.function', 'meta.function-call', 'support.class', 'entity.name.class'],
      settings: { foreground: '#004961' },
    },
    {
      scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string', 'markup.deleted'],
      settings: { foreground: '#aa0b56' },
    },
    {
      scope: ['constant', 'constant.numeric', 'constant.language', 'constant.character', 'support.constant', 'string.regexp'],
      settings: { foreground: '#790e3d' },
    },
    {
      scope: ['entity.name.type', 'support.type', 'entity.other.attribute-name', 'variable.other.property'],
      settings: { foreground: '#444141' },
    },
    { scope: ['variable.parameter'], settings: { foreground: '#201e1d', fontStyle: 'italic' } },
    { scope: ['punctuation', 'keyword.operator', 'meta.brace'], settings: { foreground: '#444141' } },
    { scope: ['meta.diff.header', 'meta.diff.range'], settings: { foreground: '#605d5d' } },
    { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    { scope: ['markup.heading'], settings: { fontStyle: 'bold' } },
  ],
};

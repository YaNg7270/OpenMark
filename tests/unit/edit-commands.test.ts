import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  insertBlock,
  insertLink,
  setHeading,
  shiftHeading,
  toggleLinePrefix,
  toggleWrap,
  type EditResult,
  type TextSelection,
} from '@/core/markdown/edit-commands';

/**
 * Cases are written as one string: `«…»` marks a selection, `‸` a caret. The result is
 * rendered back the same way, so each assertion reads as before → after.
 */
function parse(marked: string): { text: string; sel: TextSelection } {
  const caret = marked.indexOf('‸');
  if (caret !== -1) return { text: marked.replace('‸', ''), sel: { from: caret, to: caret } };
  const from = marked.indexOf('«');
  const to = marked.indexOf('»') - 1;
  return { text: marked.replace('«', '').replace('»', ''), sel: { from, to } };
}

function render(text: string, result: EditResult): string {
  const next = applyEdits(text, result.changes);
  const { from, to } = result.selection;
  if (from === to) return `${next.slice(0, from)}‸${next.slice(from)}`;
  return `${next.slice(0, from)}«${next.slice(from, to)}»${next.slice(to)}`;
}

function run(marked: string, command: (text: string, sel: TextSelection) => EditResult): string {
  const { text, sel } = parse(marked);
  return render(text, command(text, sel));
}

describe('toggleWrap', () => {
  const bold = (text: string, sel: TextSelection) => toggleWrap(text, sel, '**');
  const italic = (text: string, sel: TextSelection) => toggleWrap(text, sel, '*');

  it('wraps a selection and keeps the word selected', () => {
    expect(run('a «word» b', bold)).toBe('a **«word»** b');
  });

  it('unwraps what it just wrapped, so the shortcut is a toggle', () => {
    expect(run('a **«word»** b', bold)).toBe('a «word» b');
  });

  it('unwraps a selection that includes the markers', () => {
    expect(run('a «**word**» b', bold)).toBe('a «word» b');
  });

  it('inserts an empty pair at a caret, with the caret inside', () => {
    expect(run('a ‸ b', bold)).toBe('a **‸** b');
  });

  it('does not strip one star of a bold run when italic is toggled', () => {
    // Removing a single `*` would silently turn bold into italic.
    expect(run('**«word»**', italic)).toBe('***«word»***');
  });

  it('removes the italic star again from bold italic', () => {
    expect(run('***«word»***', italic)).toBe('**«word»**');
  });

  it('wraps with asymmetric markers', () => {
    expect(run('«u»', (t, s) => toggleWrap(t, s, '<u>', '</u>'))).toBe('<u>«u»</u>');
    expect(run('<u>«u»</u>', (t, s) => toggleWrap(t, s, '<u>', '</u>'))).toBe('«u»');
  });
});

describe('insertLink', () => {
  it('puts the caret in the URL when text was selected', () => {
    expect(run('see «docs» here', (t, s) => insertLink(t, s))).toBe('see [docs](‸) here');
  });

  it('puts the caret in the label when nothing was selected', () => {
    expect(run('see ‸', (t, s) => insertLink(t, s))).toBe('see [‸]()');
  });

  it('inserts an image reference', () => {
    expect(run('«alt»', (t, s) => insertLink(t, s, true))).toBe('![alt](‸)');
  });
});

describe('setHeading', () => {
  it('turns a paragraph into a heading and keeps the caret on the same text', () => {
    expect(run('Title‸\nbody', (t, s) => setHeading(t, s, 2))).toBe('## Title‸\nbody');
  });

  it('replaces an existing heading level', () => {
    expect(run('### Ti‸tle', (t, s) => setHeading(t, s, 1))).toBe('# Ti‸tle');
  });

  it('applying the same level again returns a paragraph', () => {
    expect(run('## Ti‸tle', (t, s) => setHeading(t, s, 2))).toBe('Ti‸tle');
  });

  it('level 0 always gives a paragraph', () => {
    expect(run('#### T‸', (t, s) => setHeading(t, s, 0))).toBe('T‸');
  });

  it('applies to every line of a multi-line selection', () => {
    expect(run('«a\nb»', (t, s) => setHeading(t, s, 3))).toBe('### «a\n### b»');
  });
});

describe('shiftHeading', () => {
  const promote = (t: string, s: TextSelection) => shiftHeading(t, s, 1);
  const demote = (t: string, s: TextSelection) => shiftHeading(t, s, -1);

  it('promotes towards h1 and stops there', () => {
    expect(run('### T‸', promote)).toBe('## T‸');
    expect(run('# T‸', promote)).toBe('# T‸');
  });

  it('promotes a paragraph to h6', () => {
    expect(run('T‸', promote)).toBe('###### T‸');
  });

  it('demotes towards h6 and then back to a paragraph', () => {
    expect(run('## T‸', demote)).toBe('### T‸');
    expect(run('###### T‸', demote)).toBe('T‸');
    expect(run('T‸', demote)).toBe('T‸');
  });
});

describe('toggleLinePrefix', () => {
  it('quotes every selected line, and unquotes them again', () => {
    expect(run('«a\nb»', (t, s) => toggleLinePrefix(t, s, 'quote'))).toBe('> «a\n> b»');
    expect(run('«> a\n> b»', (t, s) => toggleLinePrefix(t, s, 'quote'))).toBe('«a\nb»');
  });

  it('numbers an ordered list from one', () => {
    expect(run('«a\nb\nc»', (t, s) => toggleLinePrefix(t, s, 'ordered'))).toBe('1. «a\n2. b\n3. c»');
  });

  it('switches a bullet list to an ordered one in one step', () => {
    expect(run('«- a\n- b»', (t, s) => toggleLinePrefix(t, s, 'ordered'))).toBe('1. «a\n2. b»');
  });

  it('removes a bullet list when every line already has one', () => {
    expect(run('«- a\n- b»', (t, s) => toggleLinePrefix(t, s, 'bullet'))).toBe('«a\nb»');
  });

  it('does not treat a task item as a plain bullet', () => {
    expect(run('- [ ] a‸', (t, s) => toggleLinePrefix(t, s, 'task'))).toBe('a‸');
    expect(run('- a‸', (t, s) => toggleLinePrefix(t, s, 'task'))).toBe('- [ ] a‸');
  });

  it('keeps indentation and skips blank lines', () => {
    expect(run('«  a\n\n  b»', (t, s) => toggleLinePrefix(t, s, 'bullet'))).toBe('  - «a\n\n  - b»');
  });

  it('does not touch the line after a selection that ends at its start', () => {
    expect(run('«a\n»b', (t, s) => toggleLinePrefix(t, s, 'quote'))).toBe('> «a\n»b');
  });
});

describe('insertBlock', () => {
  it('puts a code fence on its own lines with the caret where the language goes', () => {
    expect(run('para‸', (t, s) => insertBlock(t, s, 'code'))).toBe('para\n\n```‸\n\n```');
  });

  it('wraps the selection in a math block with the caret at the end of the body', () => {
    expect(run('«x^2»', (t, s) => insertBlock(t, s, 'math'))).toBe('$$\nx^2‸\n$$');
  });

  it('separates the block from a following paragraph', () => {
    expect(run('‸after', (t, s) => insertBlock(t, s, 'table'))).toBe('| ‸ |  |\n| --- | --- |\n|  |  |\n\nafter');
  });
});

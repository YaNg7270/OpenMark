import { describe, expect, it } from 'vitest';
import { applyEdits } from '@/core/markdown/edit-commands';
import { autoPairEdit } from '@/core/markdown/auto-pair';

/**
 * Same notation as `edit-commands.test.ts`: `‸` is a caret, `«…»` a selection. Each case reads
 * as "type this character here", so the expectation is what the user should see on screen.
 */
function type(marked: string, insert: string): string | null {
  const caret = marked.indexOf('‸');
  const from = caret !== -1 ? caret : marked.indexOf('«');
  const to = caret !== -1 ? caret : marked.indexOf('»') - 1;
  const text = marked.replace('‸', '').replace('«', '').replace('»', '');
  const result = autoPairEdit({ text, from, to, insert });
  if (!result) return null;
  const next = applyEdits(text, result.changes);
  const { from: a, to: b } = result.selection;
  if (a === b) return `${next.slice(0, a)}‸${next.slice(a)}`;
  return `${next.slice(0, a)}«${next.slice(a, b)}»${next.slice(b)}`;
}

describe('auto-pair: the inline delimiters', () => {
  it('pairs a single asterisk', () => {
    expect(type('x ‸', '*')).toBe('x *‸*');
    expect(type('say ‸hello', '*')).toBe('say *‸*hello');
  });

  it('lengthens the pair on the second asterisk instead of nesting one', () => {
    // After the first keystroke the caret sits between the halves.
    expect(type('*‸*', '*')).toBe('**‸**');
    // And a third, which is bold italic.
    expect(type('**‸**', '*')).toBe('***‸***');
  });

  it('pairs strikethrough on the second tilde, because one is not Markdown', () => {
    expect(type('x ‸', '~')).toBe(null);
    expect(type('~‸', '~')).toBe('~~‸~~');
  });

  it('pairs inline code and inline math', () => {
    expect(type('a ‸', '`')).toBe('a `‸`');
    expect(type('x = ‸', '$')).toBe('x = $‸$');
  });

  it('pairs code and math tight against text, where they are routinely written', () => {
    expect(type('价格为a‸元', '$')).toBe('价格为a$‸$元');
    expect(type('use ‸foo', '`')).toBe('use `‸`foo');
  });

  it('wraps a selection rather than replacing it', () => {
    // Typing over a selection normally deletes it; a stray `*` must not eat a paragraph.
    expect(type('«word»', '*')).toBe('*«word»*');
    expect(type('«word»', '~')).toBe('~~«word»~~');
    expect(type('a «b c» d', '`')).toBe('a `«b c»` d');
  });

  it('steps over the closing half instead of doubling it', () => {
    expect(type('*word‸*', '*')).toBe('*word*‸');
    expect(type('**bold‸**', '*')).toBe('**bold**‸');
    expect(type('`code‸`', '`')).toBe('`code`‸');
    expect(type('$x‸$', '$')).toBe('$x$‸');
  });
});

describe('auto-pair: where it must stay out of the way', () => {
  it('does not open emphasis strictly inside a word', () => {
    // `2*3` and `snake_case`: a close here would have to be deleted by hand.
    expect(type('2‸3', '*')).toBe(null);
    expect(type('snake‸case', '~')).toBe(null);
  });

  it('does not open emphasis immediately before a space', () => {
    // Markdown would not emphasise `* *` anyway, so the pair is only noise.
    expect(type('a ‸ b', '*')).toBe(null);
    expect(type('a ‸ b', '~')).toBe(null);
  });

  it('does open emphasis at the end of a line', () => {
    // The most common place of all: `*word*` finished just before Enter.
    expect(type('a‸\n', '*')).toBe('a*‸*\n');
    expect(type('a‸\nnext', '*')).toBe('a*‸*\nnext');
  });

  it('does not pair a lone delimiter at the start of a line, which is block syntax', () => {
    // A bullet, a fence and display math all start this way.
    expect(type('‸', '*')).toBe(null);
    expect(type('\n‸', '*')).toBe(null);
    expect(type('- item\n  ‸', '*')).toBe(null);
    expect(type('‸', '`')).toBe(null);
    expect(type('‸', '$')).toBe(null);
  });

  it('still pairs two characters at the start of a line', () => {
    // `**` and `~~` cannot be block syntax, so there is nothing to protect.
    expect(type('x ‸', '*')).toBe('x *‸*');
    expect(type('~‸', '~')).toBe('~~‸~~');
    expect(type('\n~‸', '~')).toBe('\n~~‸~~');
  });

  it('will not extend a fence into four or five backticks', () => {
    // A fence longer than three backticks quotes code that contains a fence.
    expect(type('``‸', '`')).toBe(null);
    expect(type('```‸', '`')).toBe(null);
  });

  it('ignores anything that is not one delimiter character', () => {
    expect(type('‸', '')).toBe(null);
    expect(type('‸', '**')).toBe(null);
    expect(type('‸', 'a')).toBe(null);
    expect(type('‸', ' ')).toBe(null);
  });

  it('does not open a second pair when a delimiter is already open on the line', () => {
    // `*text|` + `*` means "close it", not "open another".
    expect(type('*text‸', '*')).toBe(null);
    expect(type('*text more‸', '*')).toBe(null);
    // The same holds mid-line, after the open pair.
    expect(type('a *b‸ c', '*')).toBe(null);
    // Once closed, a third opens a new pair again.
    expect(type('*a* b‸', '*')).toBe('*a* b*‸*');
    // `~~` needs a whole earlier `~~`, so a pair opened there blocks a third tilde.
    expect(type('~~text‸', '~')).toBe(null);
    // A single earlier `~` is not strikethrough at all, so this stays a literal tilde.
    expect(type('~text‸', '~')).toBe(null);
  });

  it('measures the open delimiter across a soft line break but not across a blank line', () => {
    // Emphasis may span a soft break, so a closed pair on the line above must not block...
    expect(type('*a*\nb‸', '*')).toBe('*a*\nb*‸*');
    // ...but an open one there does, because the text still belongs to the same paragraph.
    expect(type('*a\nb‸', '*')).toBe(null);
    // A blank line ends the paragraph, so the count restarts.
    expect(type('*a\n\nb‸', '*')).toBe('*a\n\nb*‸*');
  });

  it('leaves an asymmetric run alone rather than guessing', () => {
    // `*|**` is ambiguous; inserting a close would pick one reading for the user.
    expect(type('*‸**', '*')).toBe(null);
    expect(type('**‸*', '*')).toBe(null);
  });
});

describe('auto-pair: caret placement', () => {
  it('always leaves the caret between the halves', () => {
    expect(type('‸', '*')).toBe(null); // start of line: refused
    expect(type('x ‸', '*')).toBe('x *‸*');
    expect(type('*‸*', '*')).toBe('**‸**');
    expect(type('a‸', '`')).toBe('a`‸`');
  });

  it('keeps the text after the caret intact', () => {
    expect(type('a‸bc', '$')).toBe('a$‸$bc');
  });

  it('leaves a wrapped selection selected, inside the new delimiters', () => {
    expect(type('«abc»', '$')).toBe('$«abc»$');
  });
});

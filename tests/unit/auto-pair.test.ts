import { describe, expect, it } from 'vitest';
import { applyEdits } from '@/core/markdown/edit-commands';
import { autoPairEdit, isPairDelimiter } from '@/core/markdown/auto-pair';

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

  it('restarts the count at the *nearest* blank line, not the first one', () => {
    /*
     * Three paragraphs after the stray delimiter. The scope has to be the paragraph the caret
     * is in, so a stray `*` two paragraphs back cannot veto every later pair.
     */
    expect(type('a\n\n*b\n\nc\n\nd‸', '*')).toBe('a\n\n*b\n\nc\n\nd*‸*');
    expect(type('a\n\n*b\n\nc\n\nd\n\ne‸', '*')).toBe('a\n\n*b\n\nc\n\nd\n\ne*‸*');
    // A stray delimiter two paragraphs back does not leak into this one...
    expect(type('a\n\n*b\n\nc‸', '*')).toBe('a\n\n*b\n\nc*‸*');
    // ...but one in the *same* paragraph still blocks, which is the rule's whole point.
    expect(type('a\n\n*b\nc‸', '*')).toBe(null);
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

describe('auto-pair: bounded input', () => {
  /*
   * The source editor passes the whole document here — these tests call `autoPairEdit`
   * directly — but the adapter hands it a 4,000-character window instead. That window is *not*
   * equivalent to the whole document, and the difference is documented in `windowAround`: in a
   * single paragraph longer than the window, an unclosed delimiter before it is invisible and a
   * pair opens that should have closed. Pin the boundary so the limit is deliberate.
   */
  it('loses the open-delimiter veto past the window, and says so', () => {
    /*
     * The stray `*` has to sit *further back than the window* for truncation to matter — that
     * is the whole point. `long` has it 4,500 characters before the caret.
     */
    const long = `*${'x'.repeat(4_500)}`;

    // Whole text: the unclosed `*` is in the same paragraph, so no second pair opens.
    expect(type(`${long}‸`, '*')).toBe(null);

    // What the adapter actually passes — the trailing 4,000 characters — does not contain it,
    // so the pair opens. A redundant closing half the user deletes; not corrupted text.
    const windowed = long.slice(-4_000);
    expect(type(`${windowed}‸`, '*')).toBe(`${windowed}*‸*`);
  });

  it('sees the stray delimiter when it is inside the window', () => {
    // Just inside the bound: the veto applies, which is what makes 4,000 the real threshold.
    const inside = `*${'x'.repeat(3_900)}`;
    expect(type(`${inside}‸`, '*')).toBe(null);
  });

  it('still refuses a delimiter in the same paragraph inside a small window', () => {
    // The window bound is the only thing that changes; paragraph scoping is independent of it.
    const near = `*word\n\n${'y'.repeat(200)}`;
    expect(type(`${near}‸`, '*')).toBe(`${near}*‸*`);
  });

  it('reports which characters it can pair, so callers can skip the work', () => {
    expect(isPairDelimiter('*')).toBe(true);
    expect(isPairDelimiter('~')).toBe(true);
    expect(isPairDelimiter('`')).toBe(true);
    expect(isPairDelimiter('$')).toBe(true);
    expect(isPairDelimiter('a')).toBe(false);
    expect(isPairDelimiter('')).toBe(false);
    expect(isPairDelimiter('**')).toBe(false);
  });
});

describe('auto-pair: paragraph scan boundaries', () => {
  it('treats an indented blank line as a paragraph break', () => {
    // `\n   \n` is still a blank line, so the earlier `*` is in another paragraph.
    expect(type('*a\n   \nb‸', '*')).toBe('*a\n   \nb*‸*');
  });

  it('does not treat a soft line break as a paragraph break', () => {
    expect(type('*a\nb‸', '*')).toBe(null);
  });

  it('handles the very start of a document', () => {
    // A lone `*` there is a bullet marker, so it is refused like any other line start.
    expect(type('‸', '*')).toBe(null);
    expect(type('a‸', '*')).toBe('a*‸*');
  });

  it('ignores the run immediately before the caret when counting openers', () => {
    // `**` is the pair being extended, not an unclosed opener.
    expect(type('a**‸', '*')).toBe('a***‸***');
  });
});

import { describe, expect, it } from 'vitest';
import { applyEdits, type EditResult, type TextSelection } from '@/core/markdown/edit-commands';
import { continueList, renumberLines, shiftListItems } from '@/core/markdown/list-commands';

/** Same notation as `edit-commands.test.ts`: `«…»` is a selection, `‸` a caret. */
function parse(marked: string): { text: string; sel: TextSelection } {
  const caret = marked.indexOf('‸');
  if (caret !== -1) return { text: marked.replace('‸', ''), sel: { from: caret, to: caret } };
  const from = marked.indexOf('«');
  const to = marked.indexOf('»') - 1;
  return { text: marked.replace('«', '').replace('»', ''), sel: { from, to } };
}

function run(marked: string, command: (text: string, sel: TextSelection) => EditResult | null): string | null {
  const { text, sel } = parse(marked);
  const result = command(text, sel);
  if (!result) return null;
  const next = applyEdits(text, result.changes);
  const { from, to } = result.selection;
  if (from === to) return `${next.slice(0, from)}‸${next.slice(from)}`;
  return `${next.slice(0, from)}«${next.slice(from, to)}»${next.slice(to)}`;
}

const indent = (t: string, s: TextSelection) => shiftListItems(t, s, 1);
const outdent = (t: string, s: TextSelection) => shiftListItems(t, s, -1);

describe('renumberLines', () => {
  it('counts each level separately and keeps a deliberate start number', () => {
    const lines = ['5. a', '1. b', '   1. c', '   7. d', '9. e'];
    renumberLines(lines);
    expect(lines).toEqual(['5. a', '6. b', '   1. c', '   2. d', '7. e']);
  });

  it('restarts after unindented text ends the list', () => {
    const lines = ['1. a', '2. b', '', 'para', '', '4. c'];
    renumberLines(lines);
    expect(lines).toEqual(['1. a', '2. b', '', 'para', '', '4. c']);
  });
});

describe('shiftListItems', () => {
  it('nests an item under the previous one and renumbers both levels', () => {
    expect(run('1. a\n2. b‸\n3. c', indent)).toBe('1. a\n   1. b‸\n2. c');
  });

  it('lifts a nested item back out and renumbers', () => {
    expect(run('1. a\n   1. b‸\n2. c', outdent)).toBe('1. a\n2. b‸\n3. c');
  });

  it('nests a bullet under a bullet by the bullet width', () => {
    expect(run('- a\n- ‸b', indent)).toBe('- a\n  - ‸b');
  });

  it('does not nest the first item, which has nothing to nest under', () => {
    expect(run('- ‸a\n- b', indent)).toBe('- ‸a\n- b');
  });

  it('nests every item of a multi-line selection', () => {
    expect(run('1. a\n«2. b\n3. c»', indent)).toBe('1. a\n   1. «b\n   2. c»');
  });

  it('leaves non-list lines to the caller', () => {
    expect(run('plain ‸text', indent)).toBeNull();
  });
});

describe('continueList', () => {
  it('starts the next ordered item and renumbers the ones below', () => {
    expect(run('1. a‸\n2. b', continueList)).toBe('1. a\n2. ‸\n3. b');
  });

  it('splits an item at the caret', () => {
    expect(run('- ab‸cd', continueList)).toBe('- ab\n- ‸cd');
  });

  it('continues a task list with an unchecked box', () => {
    expect(run('- [x] done‸', continueList)).toBe('- [x] done\n- [ ] ‸');
  });

  it('ends the list on an empty item', () => {
    expect(run('- a\n- ‸', continueList)).toBe('- a\n‸');
  });

  it('keeps the indentation of a nested item', () => {
    expect(run('1. a\n   1. b‸', continueList)).toBe('1. a\n   1. b\n   2. ‸');
  });

  it('is not a list continuation outside a list or inside the marker', () => {
    expect(run('text‸', continueList)).toBeNull();
    expect(run('-‸ a', continueList)).toBeNull();
  });
});

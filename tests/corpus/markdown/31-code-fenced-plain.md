# Plain Fenced Code

Not every block needs a language. When a fence carries no info string,
the renderer cannot highlight it, but it still preserves the literal
text and the spacing exactly as written.

```
plain text line one
plain text line two

    indented content stays indented
```

```
another block
without any language tag
```

The first block above contains a blank line and an indented line, both
of which must survive untouched. The second block is short and shows
that an empty info string is perfectly valid. A parser that counts
fences should report exactly two blocks for this file.

Because there is no language hint, the renderer has to fall back to a
neutral monospace font. That is still a code block, not a paragraph,
so inline markup inside it stays literal.

Without an info string the renderer cannot guess a language, so it
should never attempt highlighting. Some editors try to guess from the
shape of the text, but that behaviour is optional and must not change
the block boundaries.

A blank line inside a plain block is still content, not a paragraph
break. The fence is the only thing that ends the block, which is why
the first example keeps its internal spacing.

Two blocks, no languages, one file: the smallest useful case for
testing fence recognition.

The two blocks are counted, not highlighted, which is exactly what this
fixture is for.

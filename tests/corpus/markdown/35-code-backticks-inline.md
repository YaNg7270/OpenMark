# Backticks In Inline Code

A single backtick span cannot contain another backtick, so when the
literal text itself includes one, the author widens the span. The
double backtick form below renders a lone backtick character.

To show one backtick, write `` ` `` in the source. To show a backtick
next to a word, write `` return `id` `` and the reader sees that
fragment exactly as typed, with both backticks intact.

The fenced block below demonstrates how to write a fence on its own
lines, so the pattern is visible without being interpreted.

````text
```js
const ready = true;
```
````

Notice that the outer fence uses four backticks while the inner one
uses three, so the inner lines remain literal content of the single
block. A parser should count exactly one fenced block in this file.

Inline spans and fenced blocks solve different problems. Spans keep a
fragment on the same line as the surrounding prose, while fences give a
whole region to one literal run of text.

The rule for a code span is that the opening run must match the closing
run, and the content is everything between them, trimmed of one leading
and one trailing space when both are present.

Because of that rule, a span can contain any number of backticks as
long as the delimiters are longer. A two backtick span holds a single
backtick, and a three backtick span holds a pair.

The fenced example above applies the same idea at block scale.

A reader that mistakes the inner fence for a real one would split the
text into several blocks, which is precisely what the outer length is
there to prevent.

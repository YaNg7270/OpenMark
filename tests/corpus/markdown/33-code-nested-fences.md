# Nested Fences

When a code block must show another fenced block, the outer fence
simply uses more backticks than the inner one. The parser closes the
outer block only when it sees a fence line at least as long as the
opening fence.

````markdown
The snippet below is a complete Markdown document.

```js
const answer = 42;
```

End of the embedded document.
````

The outer block uses four backticks and the inner block uses three, so
the inner fence is literal content rather than a real boundary. A
correct parser should report exactly one fenced block for this file,
whose entire body is the Markdown snippet.

Shortening the outer fence to three backticks would close the block
early and turn the rest of the snippet into ordinary paragraphs, which
is exactly the failure this fixture is meant to detect.

The same technique appears whenever documentation includes examples of
documentation. A fence inside a fence is the standard way to preserve
the literal markers, and the extra backticks are the whole trick.

An alternative is to indent the inner block by four spaces, but that
relies on indented code blocks, which are easy to break in a list. The
longer outer fence keeps the structure explicit.

Tests should assert one block here and one block only.

Any reader that reports two blocks has reopened the inner fence as if
it were a real boundary, which is the classic nested fence bug.

The outer fence length is the only signal that keeps the inner block literal.

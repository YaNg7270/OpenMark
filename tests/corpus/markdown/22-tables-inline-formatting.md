# Tables With Inline Formatting

Cells in a GFM table may contain the same inline constructs as any
other paragraph. The table below mixes code spans, strong emphasis,
emphasis and a link so that an inline parser is exercised on every row.

| Concept | Syntax | Note |
| --- | --- | --- |
| Code span | `npm run build` | runs the **production** compiler |
| Strong | **never commit secrets** | see the *security* guide |
| Emphasis | *eventually consistent* | storage layer may lag |
| Link | [design doc](https://example.com/design) | hosted on the *wiki* |

The inline code spans above contain only plain text, so the parser must
not interpret their contents as markup. The bold and italic runs are
balanced, which means every opener has a matching closer on the same
line. The link target is an ordinary URL and the link label is ordinary
prose.

Two subtle points are worth stating. First, emphasis markers must be
resolved inside the cell, not across cell boundaries. Second, a code
span always wins over emphasis, so underscores or stars inside a span
stay literal even when they would otherwise open emphasis.

A link destination may contain characters that are special elsewhere,
so the parser must scan the destination as a single unit and never
apply emphasis rules inside it.

Fixtures for inline formatting are cheap to write and expensive to get
wrong, because one ordering mistake can shift the meaning of a whole
row without changing the visible column count.

The safest mental model is a two pass reader: first split the row into
cells, then run the inline scanner on each cell independently.

A code span also protects its content from every other rule, so the
link syntax inside a span stays visible as characters instead of being
resolved into an anchor.

The fixture stops here on purpose, because extra decoration would only
blur the counts a test is expected to assert.

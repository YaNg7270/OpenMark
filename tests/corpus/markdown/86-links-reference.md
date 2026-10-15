# Reference Links

Reference-style links keep long addresses out of the running text. The author
writes a short label in the paragraph and collects the real destination in one
list at the bottom of the file, which keeps sentences readable and makes the
set of external targets easy to audit.

The full form pairs a visible text with a separate label, so the reader sees a
natural phrase while the compiler looks up the destination by label.[the specification][spec]

The shortcut form uses the label itself as the link text, which works well for
short names that read correctly on their own. See the [glossary] for the terms
used throughout this document.

The collapsed form repeats the text in a second pair of brackets, which gives
authors a way to keep the text and the label in sync automatically.[tutorial][]

Definitions live at the bottom of the file and are never rendered as visible
text. A reference that matches no definition is left as literal brackets, which
is a separate failure mode covered by another fixture in this corpus.

[spec]: https://example.com/specification
[glossary]: https://example.com/glossary
[tutorial]: https://example.com/tutorial

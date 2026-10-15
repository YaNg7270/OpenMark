# Footnotes Overview

Markdown footnotes attach short annotations to a reference in the running text.
The renderer assigns numbers automatically and collects the definitions at the
end of the document. Many writers prefer them to inline parenthetical remarks
because they keep the main sentence readable.[^1] This fixture keeps every
definition on a single line so that a unit test can count them without any
ambiguity about continuation blocks.

A named footnote uses a descriptive label instead of a bare number.[^note]
Labels stay stable when the surrounding prose moves, because the compiler
matches each reference to its definition by the shared identifier rather than
by the position of the reference in the document.

Citation footnotes are useful when a claim needs a visible source, while the
body text should not be interrupted by bibliographic detail.[^src] The compiler
does not care what the label means. It only requires that each label is defined
exactly once and referenced at least once somewhere in the file.

When a footnote is referenced but never defined, most renderers leave the raw
bracketed text in place as a literal string. That behavior is what the health
check fixtures exercise elsewhere in this corpus, and it is deliberately not
repeated here.

Footnotes may also appear in lists and block quotes, but this file keeps them
in ordinary paragraphs so that the expected count of definitions remains easy
to verify by reading the source.

[^1]: A numeric footnote used to introduce the most common syntax.

[^note]: A named footnote whose label is a short readable word.

[^src]: A citation footnote recording where a statement originally came from.

# Display Mathematics with Parenthesis Delimiters

The bracket form of display mathematics uses a backslash followed by a
square bracket for the opener and a backslash followed by a closing square
bracket for the closer. Each half occupies its own line, and the formula
sits between them.

Newton's second law is the first example.

\[
F = ma
\]

The equation states that force equals mass times acceleration, and it is
deliberately simple so that the surrounding syntax stays easy to inspect
when something goes wrong.

The second example moves to a geometric setting.

\[
A = \pi r^2
\]

Here the area of a circle depends only on its radius, and the constant
appears as a Greek letter rather than as a long decimal expansion.

Exactly two display blocks appear in this fixture, and each one keeps its
opener and its closer on separate lines, with the formula alone between
them.

No inline expression and no dollar sign is present anywhere in the file, so
the two blocks above are the only mathematics the parser should find.

The bracket form was once the default in previewers that did not support
the dollar syntax, and it survives today mainly for compatibility with older
documents.

Tests for this form usually count the openers and the closers separately,
because a mismatch is the most common authoring error with this pair.

A well formed block keeps exactly one formula between the two halves.

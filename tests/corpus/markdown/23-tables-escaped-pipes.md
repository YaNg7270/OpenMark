# Tables With Escaped Pipes

A literal vertical bar inside a table cell must be written as an
escaped pipe, otherwise the parser treats it as a column boundary. The
table below uses the escape sequence several times to prove the point.

| Expression | Meaning | Notes |
| --- | --- | --- |
| `a \| b` | bitwise OR | works on integers |
| `x \|\| y` | logical OR | short circuits |
| `ls \| wc -l` | shell pipeline | counts output lines |
| `p \| q` | logical implication | reads either way |

Every backslash above shields a single vertical bar, so the rendered
cells keep their bars while the surrounding table keeps its shape. A
naive splitter that only looks for the raw bar character would
incorrectly produce twice as many cells on these rows.

The escape is removed during rendering, which means the reader sees a
plain bar and never the backslash. Writers should therefore add the
backslash only when the bar belongs to the cell text rather than to the
table structure.

The delimiter row never needs an escaped bar, because it holds only
colons and hyphens, so any bar that appears there is structural by
definition.

A second pitfall is the trailing bar. Some authors omit it and expect
the parser to infer the final cell, while others include it and expect
the parser to ignore it. Both forms are common, and both should end up
producing the same number of cells.

A third pitfall is the double pipe, which appears in boolean
expressions in many languages. Written without escaping it silently
splits the row, so the fixture keeps two of them on a single line.

The safest reading rule is to scan left to right, treating a backslash
followed by a bar as ordinary text and every other bar as a boundary.

Nothing else in this file introduces a bar character outside the table.

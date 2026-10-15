# Wide Ten Column Table

Wide tables are rare, but they do appear in configuration references
and in test fixtures for parsers that must track many column
boundaries at once. The table below declares ten columns and fills
three body rows.

| A | B | C | D | E | F | G | H | I | J |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| aa | bb | cc | dd | ee | ff | gg | hh | ii | jj |
| ab | bc | cd | de | ef | fg | gh | hi | ij | jk |
| ac | bd | ce | df | eg | fh | gi | hj | ik | jl |

Every row above must produce exactly ten cells. Short abbreviations
keep each line narrow enough to read without horizontal scrolling,
which matters when the same fixture is inspected on a laptop screen.

A parser can verify its work by comparing the number of separators it
finds against the number it found on the delimiter row. If the two
counts ever disagree, the row is malformed and the table has ended.

Wide tables are also a useful stress case for column width heuristics,
because no single column may grow so large that the others collapse to
zero pixels.

Another useful property is that the column names stay short. A ten
column header of single letters is easy to eyeball, whereas ten long
names would wrap and obscure the very structure the fixture tests.

Width also interacts with alignment. A wide table with right aligned
numeric columns is easier to compare than the same table left aligned,
which is why production references often mix the two styles.

A renderer may decide to scroll the table horizontally when the
available width is small. That is a presentation choice and must not
alter the parsed cell count in any way.

Nothing below the table opens a new block, so the document stays a
single heading followed by a single table, which keeps the expected
counts trivial to state.

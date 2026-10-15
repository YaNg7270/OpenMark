# Escaping Dollar Signs

When a literal dollar sign is needed, the escape sequence keeps it out of
the mathematics pipeline entirely, so the character is printed exactly as
written.

A vintage price tag might read \$100, and an expensive contract might list
a figure closer to \$5,000, both of which must survive rendering without
being interpreted as formulas.

Escaping is the recommended defence whenever an amount appears inside prose
that also contains real mathematics, since the two would otherwise compete
for the same delimiter.

By contrast, an expression such as $x+1$ is genuine mathematics and should
be tokenised as such, which is exactly the distinction this file is meant
to demonstrate.

Exactly one real formula appears here, and every other dollar sign in the
document is preceded by a backslash so that it stays literal.

The prose around the escaped amounts contains no digits adjacent to an
unescaped sign, which removes any chance of an accidental match.

A reader should see one hundred dollars, five thousand dollars, and a small
algebraic expression, in that order, with no surprises along the way.

A backslash in front of a dollar sign tells the parser to treat the
character as an ordinary glyph, which is the intended reading for a price.

The escape is stripped during rendering, so the reader sees a plain dollar
sign and never learns that the author had to protect it.

A test for this fixture counts the unescaped signs and expects exactly two,
which is the pair that surrounds the small algebraic expression.

The escaped amounts are then checked for literal preservation.

Both checks together pin down the intended behaviour precisely.

Nothing else in the file needs any special handling.

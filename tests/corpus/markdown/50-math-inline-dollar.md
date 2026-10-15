# Inline Mathematics with Dollar Delimiters

Mathematical notation embedded in a running sentence is one of the most
common constructs in technical writing. This fixture keeps every formula on
a single line, because the tokenizer refuses a dollar-delimited span that
crosses a line break.

A dollar sign begins an inline formula only when it is followed immediately
by a visible character, and the matching sign closes it only when a visible
character sits directly before it. Under those rules a plain square such as
$x^2$ is recognised without any ambiguity at all.

Subscripts are equally routine. When an index must stay symbolic, writers
reach for something like $a_i$ and let the surrounding prose explain what
the index ranges over and why it was introduced in the first place.

Greek letters carry a great deal of meaning in geometry and physics. An
angle written as $\alpha$ may stand for an incidence angle in optics, a
learning rate in optimisation, or a rotation about a fixed axis.

Algorithmic analysis leans on asymptotic notation, so a bound such as
$O(n\log n)$ belongs naturally inside an ordinary sentence about sorting.
The logarithm is written with a backslash command so that it renders
upright instead of slanted.

Rational numbers appear so often that they deserve their own command. The
constant $\frac{1}{2}$ turns up in probability arguments, in average-case
analysis, and in the geometry of a simple right triangle.

A compact statement of physical equivalence closes the set. The expression
$E=mc^2$ ties mass to energy and shows how comfortably a short formula can
sit inside flowing text without disturbing the line.

The point of this fixture is not the mathematics itself but the boundary
handling around it. Statements such as the one you are reading now contain
no formula at all, which gives the test suite a way to confirm that plain
prose is left completely untouched.

A final caution concerns punctuation. A comma or a period may sit directly
after the closing delimiter, and the tokenizer must not swallow it into the
formula. The sentences above exercise that pattern several times.

# Physical Units and Quantities

Scientific prose mixes numbers with units constantly, and the pu command
keeps that pairing tidy by inserting the correct spacing automatically.

A simple value with a unit looks like $\pu{9.8 m/s^2}$ when it is written
inside a sentence about free fall.

A unit raised to a power may be written on its own, as in $\pu{kg m^2}$,
which appears in the expression for a moment of inertia.

Scientific notation is handled without any manual scaling, so a value such
as $\pu{6.022e23 mol-1}$ stays compact and readable even though it spans
many orders of magnitude.

A compound unit may combine several base units at once, which is common
whenever a rate is quoted rather than a single quantity, for instance
$\pu{5 kg m/s}$ for a momentum.

Exactly four quantities are wrapped in the unit command in this document,
and each one exercises a slightly different shape of input.

No other mathematical construct is present here, so a failure in the unit
command cannot hide behind a success elsewhere in the file.

The command inserts a thin space between the number and the unit, which is
the typographic convention followed in scientific publishing.

Writing the same thing by hand would require the author to remember that
space, and a forgotten space is one of the most common defects in a draft.

Compound units are common in engineering, where a rate such as a spring
constant or a momentum has several base units multiplied together.

A test for this fixture simply counts the four command uses and checks that
none of them spans a line break.

The surrounding prose is deliberately plain so that the only interesting
characters in the file are the four command invocations.

Nothing else in the document should render as mathematics.

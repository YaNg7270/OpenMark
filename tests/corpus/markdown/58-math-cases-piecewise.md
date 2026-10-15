# Piecewise Functions

A function defined by different rules on different intervals is written with
the cases environment, which draws a tall brace on the left and places a
condition beside each branch.

The first example has three branches and an explicit condition column.

\begin{cases}
0 & x < 0 \\
x^2 & 0 \le x \le 1 \\
1 & x > 1
\end{cases}

The pieces meet at the two breakpoints, so the function is continuous even
though it is defined by three separate expressions on three separate rows.

A second variant uses the display-style cases environment, which sets the
enclosed rules at full size so that nested fractions remain legible instead
of being shrunk to script size.

\begin{dcases}
\frac{x}{2} & x < 0 \\
\frac{x^2}{2} & x \ge 0
\end{dcases}

Both environments accept an ampersand before the condition, and the double
backslash marks the end of each branch.

Exactly two environments appear here, and the first one carries three
branches while the second carries two.

The choice between the two variants is purely visual: the display form
enlarges the fractions so that a reader does not have to squint at tiny
numerals.

A test can count the branches by looking for the row separators inside the
environment, since each branch terminates with the same pair of characters.

Both functions are continuous at the breakpoint in these examples, which
keeps the illustration simple for the reader.

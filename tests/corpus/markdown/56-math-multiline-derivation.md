# A Multi-Step Derivation

A derivation reads best when every step occupies its own row and the equals
signs line up in a single column. The starred align environment exists for
exactly that purpose, because it suppresses the automatic equation numbers
that a plain align environment would add to each row.

The derivation below expands the square of a binomial in five steps.

\begin{align*}
(x + y)^2 &= (x + y)(x + y) \\
&= x^2 + xy + yx + y^2 \\
&= x^2 + 2xy + y^2 \\
&= x^2 + y^2 + 2xy \\
&= \sum_{k=0}^{2} \binom{2}{k} x^{2-k} y^{k}
\end{align*}

Each row is terminated by a double backslash, and each row after the first
begins with an ampersand so that the alignment column is respected.

The final line rewrites the same polynomial as a binomial sum, which shows
that the expanded form and the compact form agree for every choice of the
two variables.

Only one environment appears in this file, and it carries five rows in
total, so a test can count the row separators and compare them with the
expected value of four.

The starred form is preferred for derivations because a number beside every
intermediate step would clutter the page without adding any information.

Readers who want to check the algebra can follow the columns downwards,
since each equals sign sits directly beneath the one above it.

A test for this environment usually counts the row separators and compares
the total with the number of expected steps.

Five steps are present in total.

A reader comparing the two forms can see the expanded polynomial and the
compact binomial sum side by side.

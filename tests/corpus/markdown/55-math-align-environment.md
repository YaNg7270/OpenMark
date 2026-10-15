# Named Environments for Aligned Mathematics

Structure-rich mathematics often needs a named environment rather than a
bare delimiter pair, because alignment and line breaking have to be
controlled explicitly by the author.

The first environment aligns two equations on their equals signs, which is
the standard way to present a pair of related identities.

\begin{align}
a &= b + c \\
d &= e - f
\end{align}

The second environment centres its rows instead of aligning them, which is
useful when the equations are unrelated but should still be grouped under a
single heading.

\begin{gather}
p + q = r \\
s - t = u
\end{gather}

The third environment writes a small piecewise rule with a condition
column, which is the idiomatic way to define a function that changes its
behaviour at a threshold.

\begin{cases}
0 & x < 0 \\
1 & x \ge 0
\end{cases}

Exactly three top-level environments appear in this document, and each one
is closed by a matching end marker that sits on its own line.

The prose between the environments contains no delimiters at all, so the
parser has to rely on the environment syntax to recognise the mathematics.

An author who needs alignment without numbering should reach for the
starred variant, while an author who wants numbers kept can stay with the
plain form used above.

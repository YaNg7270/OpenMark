# Labels and Cross References

Numbered equations become useful when other parts of a document can point
back to them, and that requires a label attached to the equation together
with a reference at the point of use.

The first numbered equation carries an explicit tag and a label.

\begin{equation}
\label{eq:x}
\tag{1}
E = mc^2
\end{equation}

A second block numbers two rows individually, so each line can be cited on
its own without ambiguity about which relation is meant.

\begin{align}
a + b &= c \\
d - e &= f
\end{align}

The references below resolve to the first equation, once through the plain
reference command and once through the parenthesised variant.

Writing $\ref{eq:x}$ produces a bare number, while $\eqref{eq:x}$ adds the
surrounding parentheses automatically.

Exactly two reference commands appear in this file, and both point at the
label attached to the tagged equation above.

Cross references are fragile when a document is edited, so a test usually
checks that each reference resolves to an existing label rather than to a
dangling name.

Labels must be unique within a file, because two equations sharing one name
would make every reference ambiguous.

The reference commands are inline expressions, so they keep the usual
single-line discipline that the tokenizer expects.

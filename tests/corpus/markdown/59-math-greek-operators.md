# Greek Letters, Operators and Relations

Greek letters are the workhorses of mathematical prose, and a good document
uses them deliberately rather than decoratively. An angle may be named
$\alpha$, a small increment $\delta$, and a growth rate $\lambda$.

Other letters carry equally settled meanings. A random variable might be
$\xi$, a standard deviation $\sigma$, a mean $\mu$, and an angle in a
triangle $\theta$.

Additional symbols appear when the alphabet runs short, so a phase is often
$\phi$ and a wavefunction is often $\psi$, while the last letter $\omega$
usually denotes an angular frequency.

Operators describe aggregation. A sum $\sum a_i$ adds many terms, a product
$\prod b_j$ multiplies them, and an integral $\int f(x)$ accumulates a
continuum of contributions.

Relations compare quantities. One value may be $\le$ another, or $\ge$ it,
or $\neq$ to it, and in practice two measurements are frequently just
$\approx$ equal rather than exactly equal.

Arrows express mapping and implication. A function may take a domain $A \to
B$, a logical step may be written $P \Rightarrow Q$, and an element may be
sent by $x \mapsto x^2$.

Each of these expressions is a single inline span, and none of them is
split across a line break, so the tokenizer sees a clean sequence of well
formed formulas and nothing else.

The list of symbols above is deliberately short, but it already covers the
shapes that cause trouble for a tokenizer: multi-letter commands, commands
inside subscripts, and commands that stand alone.

A common authoring mistake is to write a command without the leading
backslash, which turns a symbol into a product of letters and silently
changes the meaning of an expression.

Tests therefore check that each recognised command is preserved verbatim in
the parsed output rather than being normalised away.

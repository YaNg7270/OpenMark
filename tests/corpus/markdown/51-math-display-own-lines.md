# Display Mathematics on Their Own Lines

Some formulas are too important, or simply too tall, to be squeezed into a
running sentence. Those are set on their own lines, opened and closed by a
pair of dollar signs that occupy a line each.

The first example states the famous equivalence between mass and energy.

$$
E = mc^2
$$

Nothing about the surrounding text changes. The display floats between two
ordinary paragraphs and keeps its own vertical rhythm, while the paragraphs
themselves remain plain prose with no delimiters at all.

A definite integral can be evaluated in the same way, and the result is a
plain rational number rather than a numeric approximation.

$$
\int_{0}^{1} x^2 \, dx = \frac{1}{3}
$$

Summation notation is similarly comfortable in displayed form, especially
when the upper limit is a symbol rather than a concrete number.

$$
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
$$

Three displays are enough to pin down the behaviour. Each opener stands
alone on its line, each closer does the same, and no paragraph line anywhere
in this document contains a stray delimiter.

Writers sometimes wonder whether a display needs a blank line before it.
Here every display is surrounded by blank lines on both sides, which is the
conservative habit that most Markdown engines tolerate best.

A display block may be followed immediately by commentary, provided the
blank line is kept. The reader then sees a formula, a pause, and a sentence
that interprets it, which is exactly the pattern used above.

Nothing else in this fixture matters for the test: there are no inline
formulas, no named environments, and no delimiters other than the six
dollar signs that make up the three displayed pairs.

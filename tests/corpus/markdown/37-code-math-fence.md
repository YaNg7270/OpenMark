# Math Fences

Some renderers treat a fence whose info string is math as a display
math block instead of code. The two blocks below hold raw LaTeX and
should be typeset rather than shown in a monospace font.

The first expression is a classic definite integral over the whole real
line, sometimes called the Gaussian integral.

```math
\int_{0}^{\infty} e^{-x^{2}}\,dx = \frac{\sqrt{\pi}}{2}
```

The second expression gives a closed form for the sum of the first n
positive integers.

```math
\sum_{k=1}^{n} k = \frac{n(n+1)}{2}
```

Because the info string is math, the contents are parsed as formulas.
Inside such a block a backslash starts a command and braces group its
arguments, which is the opposite of how a plain code block treats the
same characters.

Display math is normally centred and set on its own line, which is
exactly what these fences provide. The renderer reads the LaTeX, builds
a layout tree and typesets it, instead of echoing the source.

Keeping formulas in fenced blocks also avoids the inline delimiter
rules, so a document can mix prose and formulas without worrying about
pairs of delimiters.

Two formulas and two fences are all this file needs.

A reader that ignores the math info string would treat the bodies as
plain code, which changes nothing about the block count but does change
the rendered result, because the source would be echoed verbatim.

The info string decides how the body is interpreted, and nothing else does.

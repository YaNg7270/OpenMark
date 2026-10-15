# Health Check: Unclosed Math Block

A display math block opens with a double dollar sign on a line of its own and
closes with the same sequence. This file opens the block and never closes it, so
the parser has to report an unterminated math region instead of silently
swallowing the rest of the document.

$$
E = mc^2
\int_{0}^{\infty} e^{-x^2} \, dx = \frac{\sqrt{\pi}}{2}
\frac{d}{dx} x^n = n x^{n-1}

Every line after the opening delimiter is treated as math content, including the
prose you are reading right now. A reader who opens the file in an editor will
see the raw delimiters; a reader who opens it in a renderer will see a formula
that runs to the end of the document.

A health check should point at the opening line and report that no matching
closer was found. Recovery is a judgement call: the safest option is to leave
the content visible as literal text so that nothing is silently lost.

# Markdown Image With HTML Handler

A Markdown image and an HTML image can live in the same paragraph, and they
follow completely different code paths inside the compiler. The first one below
is ordinary Markdown syntax and should be handled by the image pipeline.

![sample](../assets/sample.png)

The second one is raw HTML that carries an event handler. Even though it looks
like a picture, the handler makes it a script injection vector:

<img src=x onerror=alert(1)>

A sanitizer must keep the Markdown image node intact while stripping the HTML
element and its attribute. Confusing the two paths is a common source of bugs,
because a naive filter that only inspects Markdown syntax never sees the raw
HTML at all.

The paragraph after both fragments must still render, and the surrounding prose
must be byte-for-byte identical to the source once the dangerous element has
been removed.

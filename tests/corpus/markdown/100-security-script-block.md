# Script Block

User-generated Markdown is untrusted input, and a renderer that copies raw HTML
into a page verbatim hands an attacker a scripting primitive. The block below is
the classic example.

<script>alert(1)</script>

Nothing about that block should reach the rendered document. A safe pipeline
either strips the element entirely or escapes it so that the angle brackets show
up as visible characters instead of starting a tag.

The prose on either side of the block must survive untouched, including the
blank lines that separate the paragraphs. A sanitizer that removes the script
element and leaves an empty paragraph is acceptable; one that leaks the element
into the output is not.

This fixture therefore asserts two things at once: the visible text matches the
expected paragraphs, and the serialized output contains no script element and no
executable attribute anywhere in the tree.

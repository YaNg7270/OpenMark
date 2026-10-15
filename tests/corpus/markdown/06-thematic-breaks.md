# Thematic Breaks

A thematic break is a line of three or more matching punctuation characters, optionally separated by spaces. It is always surrounded by blank lines in well-formed documents.

---

There are three accepted characters for a break: the hyphen, the asterisk, and the underscore.

***

All three render as a horizontal rule, so the choice between them is purely stylistic.

___

A line of dashes that appears directly under a paragraph becomes a setext heading instead, which is why the blank lines around a break matter so much.

---

The parser must also reject runs that are too short. Two dashes, or two asterisks, remain ordinary text rather than starting a break.

***

Spacing inside the run is allowed, so a break may be written with spaces between its characters and still be recognised.

___

Finally, a break never interrupts a paragraph that has already started, and it never joins a list or a blockquote unless the marker is repeated inside the container.

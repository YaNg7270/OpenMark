# An Unclosed Parenthesis Delimiter

The opening half of a parenthesis pair is present in the sentence below,
but its partner never arrives, so the sequence must fall back to literal
text instead of starting a formula.

The author typed the opener \( but forgot to type the closer that should
have ended the expression, which leaves the line in an odd state.

The paragraph above is deliberately malformed. A robust tokenizer notices
that no matching closer exists anywhere in the file and therefore emits the
characters literally rather than swallowing the rest of the document.

The paragraph that follows this one is perfectly ordinary and contains no
special characters whatsoever, which lets the test confirm that normal
prose after a broken delimiter is still handled correctly.

Ordinary prose continues here. The remaining sentences exist only to give
the fixture a reasonable length and to make sure that nothing later in the
file accidentally completes the dangling opener.

A final sentence reassures the reader that the rest of the document is
intact, and that only the single line above carries the incomplete pair.

The important property is locality: the broken opener must not poison the
paragraphs that follow it, and the document should still render end to end.

A tolerant parser may decide that an unmatched opener is simply a literal
character, which is the friendliest possible behaviour for a reader.

A stricter parser may raise a diagnostic and still continue, which is also
acceptable as long as the rest of the page remains usable.

The fixture deliberately avoids any second half anywhere in the file, so a
test cannot pass by accident.

Editors that highlight delimiters will show the dangling character in a
warning colour, and that is expected behaviour rather than a defect.

The rest of the text is ordinary and needs no further comment.

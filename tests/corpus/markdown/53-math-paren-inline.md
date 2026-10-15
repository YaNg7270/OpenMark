# Inline Mathematics with Parenthesis Delimiters

The backslash-parenthesis pair offers an alternative to the dollar sign, and
many authors prefer it because the two halves are visually distinct and are
therefore harder to confuse with currency amounts.

The syntax was inherited from the earlier typesetting systems, where the
square form was reserved for display mathematics and the round form was
used whenever a formula had to sit inside a paragraph.

A simple sum written as \(a + b\) behaves exactly like its dollar-sign
counterpart and occupies the same horizontal space within the line.

A short list of unknowns may be written as \(x_1, x_2, x_3\) when the
notation itself already conveys the ordering and no further explanation is
needed by the reader.

Finally the irrational number \(\sqrt{2}\) can be named directly inside a
sentence, which keeps the prose readable while still showing precise
mathematical content.

Exactly three such expressions appear in this document, and each one is
complete on a single line, so the tokenizer never has to guess where the
formula ends.

No other delimiter form is used here, which means a failure in the round
form will not be masked by a success somewhere else in the file.

The round form is convenient when a document already uses the dollar sign
for currency, because mixing the two would force the author to escape every
price by hand.

It is also easier to read in raw source, since the opening and closing
characters differ and a stray half is immediately obvious to a human.

Tests for this delimiter usually check three things: the count of opened
spans, the count of closed spans, and the absence of any span that crosses
a line break.

All three expressions above sit comfortably inside their sentences and
leave the surrounding grammar untouched.

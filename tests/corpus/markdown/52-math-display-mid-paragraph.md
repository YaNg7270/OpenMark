# Display Mathematics inside a Paragraph

Not every display is granted a line of its own. A writer may drop a short
display straight into the middle of a sentence, and the engine will still
recognise it provided the two dollar signs stay on the same line and no
line break separates them.

This style is common in lecture notes, where a formula is so short that
setting it apart would waste vertical space and interrupt the flow of the
argument for no real benefit.

Consider the Pythagorean relation, where $$a^2 + b^2 = c^2$$ holds for
every right triangle, and then ask what the identity implies for the
diagonal of a unit square whose side is exactly one.

The paragraph continues after the formula, which is the whole point. The
display is a passenger inside the sentence rather than a block that
interrupts it, and the reader barely notices the transition.

In a second example the same treatment is given to an exponential decay
law, since $$f(x) = e^{-x}$$ falls off quickly enough that its integral
over an infinite ray converges to a finite value.

Again the prose carries on past the delimiter pair, and again both dollar
signs remain on one line so that the tokenizer has no reason to doubt the
intent behind them.

Exactly two such mid-paragraph displays appear here, and no other line in
the document contains a delimiter of any kind.

A final paragraph notes the practical constraint: the pair must not be
split across lines, because a line break inside a display would make the
tokenizer abandon the whole construct and print it literally instead.

Authors should also remember that the surrounding sentence must still read
naturally once the display is removed, otherwise the paragraph becomes
awkward for anyone who copies the text into a plain editor.

The fixture therefore keeps the plain-language frame intact and lets the
formula slot into a grammatical position, which is the pattern a well
written note will use.

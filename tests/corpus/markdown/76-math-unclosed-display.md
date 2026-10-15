# A Display Block That Is Never Closed

This file is deliberately broken and exists to test recovery behaviour
rather than correctness.

The author opened a display block and then walked away from the keyboard.

$$
E = mc^2

Everything after the opening pair above is still inside the display,
because the closing pair was forgotten and no matching delimiter appears
anywhere later in the document.

A well-behaved parser either reports the error or treats the remainder as
mathematics; either way it must not crash on input like this.

The paragraph you are reading right now is therefore part of the broken
block, which is exactly the condition the fixture is designed to produce.

A recovery strategy often chooses to close the block implicitly at the end
of the document, which keeps the rendered page free of raw source text.

Another strategy discards the opener and renders everything that follows as
ordinary prose, which is friendlier when the author simply forgot a pair.

Either way, the parser must terminate and must not enter an infinite loop
while looking for a closer that does not exist.

The remaining lines of this document exist only to give the broken block a
realistic body of text to swallow, so that the test can observe how much
content is affected.

No closing pair appears anywhere below this point.

A log message from the parser would normally name the line where the
opener appeared, which helps the author fix the mistake quickly.

The document ends here without ever closing the pair.

That is the intended outcome.

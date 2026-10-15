# Missing Images

This fixture collects images whose targets do not exist anywhere in the tree.
A renderer should keep the alt text visible and record each failed target so
that a health check can report them in a single pass.

The first target lives in a sibling directory that was never created:

![alpha](./img/a.png)

The second target reaches upward into a documentation folder that only holds
text files, so the picture can never resolve:

![beta](../docs/b.jpg)

The third target is a bare filename with no directory component at all, which
is the simplest possible relative reference:

![gamma](c.gif)

None of these files are expected to appear on disk. The point of the fixture is
that the compiler treats every one of them as a normal image node and defers
existence checking to a later stage, where the missing paths can be gathered
and reported together.

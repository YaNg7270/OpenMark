# Health Check: Missing Images

A health check walks the document tree, resolves every image target against the
file system, and reports the ones that cannot be found. This fixture gives it
four failures to collect, mixed in with ordinary prose so that the resolver has
to keep parsing after each one.

The first target points at a sibling directory that does not exist:

![one](./media/one.png)

Between the images, normal text keeps the paragraphs flowing. A resolver that
stops at the first failure would miss the remaining three targets, so the parser
is expected to continue and gather them all.

The second target reaches up one level into a folder that only contains text:

![two](../images/two.jpg)

The third target uses a bare filename, which is the shortest possible relative
reference and also the easiest one to forget to create:

![three](three.webp)

The fourth and final target names a directory rather than a file, which is a
different kind of resolution error but still a missing asset:

![four](./assets/four.svg)

After the walk, the report should list exactly four unresolved targets, in the
order in which they appear in the source.

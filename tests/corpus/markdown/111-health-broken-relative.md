# Health Check: Broken Relative Targets

Links and images share the same target resolution logic, but they fail in
different ways: a broken link leaves a dead anchor, while a broken image leaves
a placeholder in the middle of the page. This fixture supplies two of each.

The first broken link points at a chapter that was renamed some time ago:

[Chapter Three](./chapters/three.md)

The second broken link walks up to a shared folder that never existed:

[Shared Notes](../shared/notes.md)

Between the links, a short sentence keeps the paragraph structure clear. The
resolver should record each failure with the resolved absolute path so that a
reader can tell a typo from a moved file.

The first broken image names a diagram that was deleted:

![diagram](./img/diagram.png)

The second broken image points at a screenshot in a sibling project:

![screenshot](../other-project/shot.png)

At the end of the walk the report should contain two broken links and two broken
images, each listed once, with no entries for any target that happens to exist.

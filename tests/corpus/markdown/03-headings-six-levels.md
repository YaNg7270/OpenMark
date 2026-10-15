# A Document With A Strict Heading Hierarchy

This fixture walks from the top level down to the sixth level without skipping a rank, so that outline builders and table-of-contents generators can be tested against a well-formed tree.

## Level Two Section

Every heading below this one is nested inside it, and every paragraph belongs to the nearest preceding heading.

### Level Three Section

A validator that tracks heading depth should accept this document without complaint.

#### Level Four Section

Deep nesting is common in API references, where a class contains methods and each method documents its parameters and return values.

##### Level Five Section

At this depth the rendered font is usually close to the size of body text, so authors often rely on colour or weight instead.

###### Level Six Section

The sixth level is the deepest rank the specification allows.

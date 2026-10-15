# Health Check: Inconsistent List Markers

A list may be written with dashes, asterisks, or plus signs, and all three are
valid on their own. This fixture deliberately mixes two of them inside a single
sibling list, which is the style mistake the check is looking for.

- The first item uses a dash, which is the most common marker in this project.
* The second item switches to an asterisk without any blank line in between.
- The third item returns to a dash, confirming that the parser keeps all three
  lines in one list despite the changing marker.
* The fourth item switches again, so the inconsistency is visible at a glance.

A formatter should rewrite every marker in the list to the configured style,
while a plain parser should still treat the block as a single list with four
items. Neither behavior is wrong on its own; the point is that the choice is
made explicitly rather than inherited from whatever the author typed.

The paragraph after the list ends the block, and no other construct appears in
this file so that the mixed markers remain the only issue under test.

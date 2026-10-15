# Frames, Objects and Embeds

Embedded content elements let a page pull in another document, a plugin, or a
binary resource. All three of the elements below are frequently used in attacks
because they execute or render third-party content inside the host page.

The first is an inline frame that would load a remote document:

<iframe src="https://example.invalid/frame"></iframe>

The second is an object element that names a data source:

<object data="x"></object>

The third is an embed element, which is the older and less controllable sibling
of the object element:

<embed src="x">

A conservative sanitizer removes all three elements outright. A permissive one
might keep a frame only when the source matches an allow-list, but the default
policy for untrusted input is removal, and that is the behavior this fixture
expects.

The paragraphs before and after the elements must remain in place, and the final
output must contain no frame, object, or embed element whatsoever.

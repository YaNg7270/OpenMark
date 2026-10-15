# Event Handler Attributes

Sometimes an element itself is on the allowed list while its attributes are not.
A paragraph, a span, and an anchor are all perfectly ordinary tags, yet each of
them can trigger script when it carries an event handler.

The first example attaches a click handler to a paragraph:

<p onclick="alert(1)">This paragraph looks normal until it is clicked.</p>

The second attaches a pointer handler to a span, which fires as soon as the
cursor moves over the text:

<span onmouseover="alert(2)">Hovering here would run code.</span>

The third attaches a focus handler to a link, which fires when the element
receives keyboard focus:

<a href="#" onfocus="alert(3)">Focusing this link would run code.</a>

A sanitizer must strip the on* attributes rather than the elements themselves,
because the allowed-tag list is about structure, not about behavior. After
sanitizing, the three fragments should read as plain text with no handlers.

This fixture exists to catch filters that check element names only and never
inspect attributes, which is one of the most common sanitizer mistakes.

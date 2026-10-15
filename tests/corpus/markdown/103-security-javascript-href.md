# JavaScript Href

A link is only as safe as its scheme. The two anchors below use the javascript
scheme, which executes code when the reader activates the link, and both must be
neutralized before the document reaches a browser.

The raw HTML form carries the scheme directly in the href attribute:

<a href="javascript:alert(1)">click</a>

The Markdown form hides the same scheme inside the target parentheses, which is
easy to overlook because the visible text looks completely ordinary:

[x](javascript:void(0))

A correct renderer refuses to emit either link. Acceptable outcomes are an
anchor without an href, an anchor pointing at a harmless placeholder, or text
with the link removed entirely, but never a working javascript destination.

The surrounding sentences confirm that the paragraph structure survives the
sanitizing step. Only the two dangerous destinations are expected to change.

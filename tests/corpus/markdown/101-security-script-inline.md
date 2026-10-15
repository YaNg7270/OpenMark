# Inline Script and Image Handler

Inline raw HTML is just as dangerous as a block, because it can appear in the
middle of a sentence where a sanitizer is least likely to look.

The sentence you are reading contains an inline <script>alert(1)</script> tag,
and the rest of the sentence continues after it without any visible gap. A
correct renderer removes the tag while keeping the surrounding words.

A common second vector abuses an attribute handler on an image. The fragment
<img src=x onerror=alert(1)> looks harmless because the source is a broken path,
yet loading it triggers the handler, which is exactly why attribute-based
handlers must be stripped along with the element.

Neither fragment should produce any executable content. The paragraph text after
sanitizing should read as ordinary prose with the malicious fragments gone and
the sentence structure intact.

This fixture pairs an inline script with an image handler so that a single test
covers both element-level and attribute-level sanitization at once.

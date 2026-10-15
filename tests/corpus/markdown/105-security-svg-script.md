# SVG With Embedded Script

An inline SVG block is a picture to the eye but a full document to the parser,
and it can carry a script element just like an HTML page. The block below mixes
drawing instructions with executable content.

<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">
<script>alert(1)</script>
<rect x="4" y="4" width="112" height="32" fill="#eee" stroke="#333"></rect>
</svg>

The rectangle alone would be harmless. The script element inside the same
document is the problem, and a sanitizer that only inspects HTML tags will miss
it entirely because the document is reached through a different parser.

A safe pipeline removes the script element and keeps the drawing, or removes the
whole SVG block. Either outcome is acceptable as long as no script element and
no event attribute survives anywhere inside the document tree.

The prose around the block is ordinary text and must be preserved so that the
comparison against the expected output is exact.

# Inline and Block HTML

Markdown allows raw HTML to pass through to the output, which is useful for the
few constructs that the plain syntax cannot express. A line break is the
simplest case: press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to submit the form.<br>
The line after the break continues the same paragraph.

Baseline shifts are another case where HTML is clearer than a custom marker.
Water is H<sub>2</sub>O, and a negative exponent is written x<sup>-1</sup>.
Both tags nest inside ordinary prose without disturbing the surrounding text.

Longer blocks are also permitted. The details element below hides a short
explanation behind a summary line, which keeps a page tidy until the reader
asks for more.

<details>
<summary>Why raw HTML is allowed at all</summary>

The original Markdown specification permitted raw HTML so that authors would
never be blocked by a missing feature. Many modern pipelines keep that promise
but sanitize the output before it reaches a browser.

</details>

After the block, ordinary paragraphs resume. The renderer must reopen a normal
paragraph context here rather than leaving the previous HTML block open.

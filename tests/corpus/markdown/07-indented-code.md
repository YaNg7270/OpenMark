# Indented Code Blocks

An indented code block is written by indenting the whole block by four spaces relative to the surrounding text. It needs a blank line before it, otherwise the indented lines are folded into the current paragraph as a lazy continuation.

    fn gcd(a: u64, b: u64) -> u64 {
        if b == 0 { a } else { gcd(b, a % b) }
    }

The block above is a complete Rust function. Note that the parser strips exactly four leading spaces and keeps everything else, including the alignment of the second line.

Between the two blocks sits this ordinary paragraph, which exists to prove that a code block ends as soon as a line is no longer indented far enough.

A common mistake is indenting only the first line, which turns the remaining lines into part of the same paragraph instead of code.

    GET /index.html HTTP/1.1
    Host: example.com
    Accept: text/html

After the second block the document returns to normal prose, and the four-space indentation rule no longer applies to any later line.

# Paragraphs And Line Breaks

The first paragraph is a single long line that stays on one line in the source file, which is the simplest possible input for a Markdown tokenizer.

The second paragraph wraps in the source but renders as one continuous line, because a plain newline inside a paragraph is a soft break that the renderer turns into a space. This sentence continues on the next source line without any special marker at the end.

The third paragraph demonstrates a hard break produced by two trailing spaces.  
The line after the break begins a new visual line while remaining inside the same paragraph, which is exactly how a manual line break should behave.

The fourth paragraph demonstrates a hard break written with a trailing backslash instead of invisible whitespace.\
Some editors strip trailing spaces, so the backslash form survives automated formatting more reliably.

The fifth paragraph mixes both techniques.  
The first break arrives through invisible spaces, and the second through an escape character.\
Both should render identically even though the source bytes differ.

The sixth paragraph deliberately contains no line break at all and runs long enough to wrap naturally in a narrow editor window, proving that visual wrapping and source wrapping are independent concerns.

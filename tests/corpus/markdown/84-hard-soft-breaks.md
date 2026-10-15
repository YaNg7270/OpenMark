# Hard and Soft Line Breaks

A soft break is what you get when a paragraph is wrapped across several source
lines without any special marker. The renderer joins those lines back into a
single visual line, so the wrapping only affects the source file and never the
published page.

A hard break can be forced with two trailing spaces at the end of a line.  
This sentence starts on a new line because the previous source line ended with
two spaces, and the break is preserved in the rendered output.  
The same trick is used for the next line as well.

A backslash at the end of a line is the other common way to request a hard
break, and many authors prefer it because the trailing character is visible in
a diff.\
This line begins immediately after the backslash break, which makes the intent
obvious even when the file is viewed in an editor that trims trailing spaces.

Soft wrapping remains the default for body text, and it is the recommended
style for long paragraphs: leaving a single space at the end of each line keeps
diffs small and avoids accidental hard breaks created by stray whitespace.

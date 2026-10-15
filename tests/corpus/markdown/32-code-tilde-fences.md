# Tilde Delimited Fences

A fenced block may also be opened with three or more tilde characters.
The tilde form is useful when the content contains several backticks,
because the two fence styles never collide with each other.

~~~bash
set -euo pipefail

mkdir -p build/release
cp config/app.toml build/release/app.toml
tar -czf build/release.tar.gz build/release
echo "archive ready"
~~~

~~~text
plain output without highlighting
a second line of text
and a third line
~~~

~~~
nested look-alike markers stay literal here
~~~

The three blocks above use tilde fences. The first two carry info
strings and the third carries none, so a parser must handle all three
cases while still counting exactly three blocks.

Tildes and backticks are interchangeable as fence characters, but the
closing fence must use the same character and at least the same length
as the opening fence.

Tilde fences are common in tutorials because the author can paste code
that already contains backticked spans without escaping anything. The
two styles are otherwise identical in behaviour.

The closing fence may be longer than the opening fence. Extra tilde
characters are ignored, as long as the line contains nothing else, so a
writer can safely use five tildes to close a block opened with three.

For a parser, the character set and the length rule are the only two
facts that need to be modelled.

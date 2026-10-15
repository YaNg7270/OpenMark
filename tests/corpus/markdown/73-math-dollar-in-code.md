# Dollar Signs inside Code

Code samples often contain dollar signs, either as a shell prompt or as an
anchor in a regular expression, and those characters must never be treated
as mathematics.

An inline span may hold a variable name such as `$HOME` or a positional
parameter such as `$1`, and neither should trigger the maths rule.

A short shell transcript shows the same idea spread across several lines,
where the prompt itself is a dollar sign followed by a space.

```sh
$ echo "hello"
hello
$ export PATH="$PATH:/opt/bin"
$ printf '%s\n' "$HOME"
/root
```

A regular expression uses the same character for end-of-line anchoring, and
an escaped dollar matches a literal one.

```regex
^[a-z]+$
price:\s*\$\d+(\.\d{2})?
```

Neither block contains anything but code, and the surrounding paragraphs
are ordinary prose with no formulas at all.

The rule under test is simple: characters that live inside a code span or a
fenced block are opaque, and the tokenizer must leave them alone.

Two fenced blocks are present in this file, one for a shell session and one
for a regular expression, and each contains several dollar signs.

Inline spans behave the same way, so a name such as the one in the second
paragraph stays literal even though it begins with the same character.

A test simply confirms that no mathematical rendering is produced anywhere
in the output of this document.

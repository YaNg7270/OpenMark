# Heading Levels in ATX Style

Markdown's ATX headings are written with one to six hash marks at the start of a line. The number of marks sets the level, so a single hash opens a top-level section while six hashes open the deepest one.

## Why ATX Beats Setext for Long Documents

Setext headings only cover two levels, so a document with real depth quickly runs out of underline characters. ATX headings scale all the way down to the sixth level without any extra syntax to remember.

This matters most in reference manuals, where a chapter may contain a dozen nested topics that each deserve their own anchor.

### Parser Behaviour Around Hashes

A space between the hashes and the title is required by the CommonMark specification. Without it the line is treated as ordinary prose, which is a frequent source of confusion when authors type quickly.

#### Escaping a Literal Hash

To start a paragraph with a hash character, escape it with a backslash so the tokenizer does not mistake it for a heading marker.

##### Depth Limits in Practice

Most style guides stop at four levels because deeper structures are hard to scan in a rendered page.

###### The Sixth Level

The sixth level is rarely used, but the grammar still accepts it.

## Closing Hashes ##

A heading may be closed with a matching run of hashes. The closing sequence is optional and is stripped during rendering, so the visible title is unchanged.

## Trailing Spaces And Closing Runs

The closing run must be preceded by a space to be recognised as a closer, otherwise it becomes part of the title text.

## Summary

Nine headings of varying depth are enough to exercise every branch of an ATX parser, including the optional closing sequence.

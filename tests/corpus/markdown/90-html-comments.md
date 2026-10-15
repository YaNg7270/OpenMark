# HTML Comments

An HTML comment is invisible in the rendered page but remains in the source
file, which makes it a convenient place for editor notes that should never
reach a reader.

<!-- This block-level comment sits between two paragraphs and produces no visible output. -->

The paragraph above ends before the comment, and the paragraph below begins
after it. A block comment on its own line is dropped entirely by the renderer,
leaving the surrounding spacing untouched.

Inline comments can also appear inside a sentence <!-- like this first one -->
where they hide a remark in the middle of the text <!-- and this second one -->
without breaking the flow of the prose or introducing stray whitespace.

Because comments carry no semantic content, a unit test can assert that the
paragraph text is identical whether or not the comments are present, while a
source-level check can confirm that all three comments survive round-tripping.

# Footnotes With Several Paragraphs

A footnote is not limited to a single sentence. Extra paragraphs belong to the
same definition as long as each continuation line is indented by four spaces,
which keeps the whole note attached to one label.[^alpha] The indentation is
what tells the parser that the following lines are still part of the note
rather than new top-level content.

The same rule applies to longer notes that need a second paragraph to cover an
edge case or an example.[^beta] A definition can therefore hold a short
explanation, a supporting detail, and a closing remark while still counting as
exactly one footnote for the purposes of a test.

Both notes below are referenced exactly once, and both are defined with more
than one paragraph. The renderer should lift each paragraph into the footnote
area beneath the document body.

[^alpha]: The first paragraph of the alpha note introduces the topic and states
    the main claim that the text relies on.

    The second paragraph of the alpha note carries the continuation, indented
    by four spaces so that the parser keeps it inside the same definition.

[^beta]: The first paragraph of the beta note sets up a contrast with the note
    above and explains why the indentation matters.

    The second paragraph of the beta note closes the thought and repeats that
    a blank line followed by an indented block stays attached to the label.

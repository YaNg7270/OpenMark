Setext Headings In Their Native Form
====================================

The setext syntax draws an underline beneath the title instead of prefixing it with a marker. It supports exactly two levels, which is why it survives mostly in README files and changelogs.

Second Level With A Dash
------------------------

A single line of dashes produces a level-two heading. Authors must be careful here, because a short run of dashes underneath a paragraph is easy to mistake for a thematic break.

Why Only Two Levels Exist
=========================

The original implementation treated the underline as decoration rather than part of the block grammar, and only two characters were ever reserved for it. Any deeper structure has to fall back to hashes.

Ambiguity With Thematic Breaks
------------------------------

A dashed line that follows a blank line rather than a paragraph is a thematic break, not a heading underline. The distinction is purely positional, so tooling must track the preceding line carefully.

Multiline Titles Are Dangerous
==============================

A setext heading cannot span several lines. The underline binds only to the immediately preceding paragraph, and any earlier continuation lines are absorbed into the heading text without warning.

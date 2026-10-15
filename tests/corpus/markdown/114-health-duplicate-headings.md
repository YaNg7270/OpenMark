# Health Check: Duplicate Headings

## Repeat Me

The first occurrence of the repeated heading introduces the topic. When several
headings share the same text, an automatic anchor generator has to disambiguate
them by appending a numeric suffix to all but the first.

## Repeat Me

The second occurrence carries identical text, so its generated anchor will not
match the one belonging to the first. A table of contents built from raw heading
text alone would produce two entries that point at the same place.

## Repeat Me

The third occurrence repeats the pattern once more. Three collisions in a row
make it obvious whether the suffix sequence is stable and deterministic.

## Distinct Heading

This heading is unique, so its anchor needs no suffix at all. It exists as a
control so that a test can confirm the generator only rewrites anchors that
actually collide.

## Repeat Me Again

This heading shares a prefix with the repeated ones but not the full text, so it
must not be treated as a collision. A generator that compares prefixes instead
of whole strings would get this wrong.

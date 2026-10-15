# Health Check: Tab-Indented Nested List

Indentation inside a list controls nesting, and most style guides require spaces
rather than tabs. This fixture uses a real tab character for the nested items so
that a checker can detect the mixture and a formatter can normalize it.

- Top level item written with a dash and two spaces of indentation.
- Second top level item that introduces a nested block below it.
	- Nested item indented with a tab instead of spaces.
	- Another nested item, also indented with a tab.
- Third top level item back at the outer level.

Some editors render a tab as four columns and others as eight, so a file that
mixes tabs and spaces can look correct to its author and shifted to everyone
else. That ambiguity is exactly why the check reports every tab used for
indentation.

The paragraph after the list confirms that the block ended cleanly and that no
other construct in the file depends on the tab characters.

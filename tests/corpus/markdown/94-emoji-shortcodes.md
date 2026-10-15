# Emoji Shortcodes As Plain Text

A long list of shortcodes has grown around chat platforms, and authors often
carry the habit into Markdown files. In a plain renderer those shortcodes are
nothing more than ordinary text, so they pass through unchanged unless a plugin
chooses to replace them.

The release announcement used :rocket: to signal the launch, :sparkles: to mark
the new features, and :white_check_mark: to list the checks that passed. Every
one of those tokens is a colon, a word, and a colon with no space between them.

A warning banner is the other common case: :warning: appears before a sentence
that describes a breaking change, so that a reader who skims the page still
notices it.

The shortcodes below are collected in a single list for convenience:

- :rocket: marks a launch or a deployment
- :sparkles: marks a newly added feature
- :white_check_mark: marks a completed and verified item
- :warning: marks something that needs attention

Whether these tokens become pictures depends entirely on the renderer. In this
fixture they must remain literal text, because no emoji plugin is enabled and
the expected output keeps the colons exactly as written.

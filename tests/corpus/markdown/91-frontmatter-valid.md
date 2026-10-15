---
title: Valid Frontmatter Example
author: Documentation Team
date: 2026-03-14
tags:
  - markdown
  - fixtures
  - metadata
draft: false
---

# Document With Valid Frontmatter

The block above is a well-formed YAML frontmatter section. It starts on the very
first line of the file, ends with a matching delimiter, and is separated from
the body by a single blank line.

The title field gives the document a display name, the author field records who
wrote it, and the date field fixes the revision in time. Together they let a
site generator sort a directory of pages without parsing the prose.

The tags field is a block sequence, which is the most diff-friendly way to list
several values because each entry occupies its own line. Adding or removing a
tag never touches the neighbouring lines.

The draft flag is a boolean, and here it is set to false, so the page is meant
to be published. A value of true would mark the page as work in progress and
exclude it from a production build.

Everything after the closing delimiter is ordinary Markdown. The heading you
are reading, the paragraphs around it, and any list or table that follows are
parsed exactly as they would be in a file without frontmatter at all.

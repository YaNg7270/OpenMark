---
title: Broken Frontmatter Example
author: Documentation Team
tags: [alpha, beta
category:    tooling
draft: false
---

# Document With Invalid Frontmatter

The block above is deliberately malformed. The tags field opens a flow sequence
with a square bracket but never supplies the closing bracket, so a YAML parser
must report an error instead of quietly producing a partial list.

The category field also uses inconsistent indentation. It lines up under the
wrong key, which is exactly the kind of mistake a hand-edited header tends to
introduce, and a strict parser will reject the whole block rather than guess at
the author's intent.

Because the header cannot be parsed, a consumer should fall back to treating
the entire file as plain Markdown. That fallback keeps the body readable even
when the metadata is broken, and it lets a health check point at the specific
line that needs fixing.

The prose below the delimiter is ordinary text, and the heading above it is an
ordinary H1. The only thing wrong with this file is the unclosed flow sequence
and the misaligned key in the header, both of which are intentional.

# Simple Data Tables

A compact reference table is often the clearest way to present a small
set of related facts. Tables force the author to decide on columns
before writing a single cell, which usually improves the final text.

The table below lists four common serialization formats together with
their typical file extensions and a short note about where each one
tends to appear in a real project.

| Format | Extension | Typical Use |
| --- | --- | --- |
| JSON | .json | Web APIs and configuration |
| YAML | .yaml | Human edited configuration |
| TOML | .toml | Build and package manifests |
| CSV | .csv | Tabular data exchange |

Each row describes exactly one format. Because every line contains the
same number of separator bars, a parser can read the header once and
then stream every body row without changing its state.

The delimiter row uses plain hyphens with no colons, which means the
columns carry no explicit alignment. Most renderers therefore fall back
to their default behaviour, typically left alignment for text.

Tables like this one are deliberately boring. They contain no inline
formatting, no escaped characters and no nested structures, so they are
easy to diff in version control and easy to assert against in tests.

A second reading of the same table is useful when checking a parser.
The header must produce three cells, each data row must produce three
cells, and the total number of body rows must be exactly four.

Fixtures also benefit from a stable shape. If a later change needs a
fifth format, it should be added as a new row rather than by widening
an existing cell, so that column counts stay predictable.

The three example rows were chosen so that no cell is empty. An empty
cell is valid, but it is easy to miss, and a fixture that never
produces one keeps the expected counts unambiguous for every reader.

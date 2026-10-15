# Ordered Lists

Numbering may be written with literal increasing numbers or with all ones.

1. The first item of a simple sequence.
2. The second item, whose number is arbitrary.
3. The third item, which closes the sequence.

A nested ordered list is indented beneath its parent item.

1. Prepare the workspace before running any build.
   1. Remove stale build artefacts.
   2. Fetch the pinned toolchain.
      1. Verify the checksum of the downloaded archive.
      2. Extract it into the local cache.
2. Run the full test suite.
3. Collect the coverage report and archive it for review.

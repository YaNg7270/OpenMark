# Relative Images

Images are embedded with the same bracket and parenthesis syntax as links, but
the leading exclamation mark tells the renderer to place a picture instead of a
clickable phrase. Relative targets are resolved against the location of the
document that contains them.

The first picture points at a tiny asset kept beside the corpus, which makes it
a useful smoke test for path resolution without loading a large file:

![dot](../assets/dot.png "A 1x1 pixel")

The second picture is a vector diagram. Vector assets keep their crispness at
any zoom level, so the rendering pipeline can scale them without resampling:

![diagram](../assets/diagram.svg)

The third picture deliberately points at a file that does not exist. A missing
image must still be reported with its alt text and dimensions so that a health
check can list it later, rather than silently dropping the paragraph.

![missing](../assets/not-here.png)

All three use relative paths, so the same source renders correctly whether the
site is served from a subdirectory or opened directly from the filesystem.

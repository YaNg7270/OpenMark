# Remote Images

An image with a remote source turns every page view into a network request to
whoever controls that host. The two images below point at a domain that is not
expected to resolve, which keeps the fixture deterministic while still
exercising the remote-source code path.

The first uses an empty alt text and a plain PNG target:

![](https://example.invalid/x.png)

The second carries alt text and points at a vector asset:

![remote](https://example.invalid/y.svg)

Remote assets must be reported by a health check and never fetched silently. A
renderer that downloads a remote picture while previewing a document leaks the
reader's address to the remote host, which is a privacy problem even when the
content itself is harmless.

Acceptable handling is to keep the source in the output but flag it, or to leave
a placeholder until the reader explicitly opts in. Fetching during parsing is
not acceptable under any configuration this project supports.

The rest of the paragraph is ordinary prose and must survive unchanged.

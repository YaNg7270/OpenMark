# Path Traversal Image Targets

A relative image path is meant to resolve inside the project, but nothing stops
an attacker from walking upward with repeated parent segments. The two images
below attempt exactly that, using a plain path and an encoded one.

The first target climbs out of the project directory with a long chain of parent
segments before naming a system file:

![](../../../../etc/passwd)

The second target hides the same traversal behind percent-encoded separators,
which a naive filter will not decode before checking:

![..](..%2F..%2Fsecrets.txt)

Neither image should ever be fetched from disk. The renderer should treat the
targets as ordinary image nodes, record them as unresolved or unsafe, and leave
the alt text in place so that the reader still sees something meaningful.

The prose surrounding the two images must remain intact, and the output must
contain no reference to any file outside the document root.

# Health Check: Dangling References

A reference link is only valid when a matching definition exists somewhere in
the file. This fixture contains two references and no definitions at all, so a
renderer must decide between leaving the raw brackets in place and reporting an
error.

The first reference uses an explicit label that points at a definition which was
never written:

Please see the [appendix][missing] for the full derivation.

The second reference uses the collapsed form, where the text doubles as the
label, and its definition is missing as well:

The [also-missing][] section was removed during the last reorganization.

Neither label appears in a definition line anywhere in this document. A
case-insensitive match is the usual rule, so the labels here are written in
lower case on purpose to make sure the lookup is not accidentally passing.

The expected output keeps both bracketed strings as literal text, and a health
check reports two dangling references by label. No definition line is present in
this file, not even at the bottom.

# Subscript, Superscript and Highlight

Scientific and technical writing often needs small shifts in baseline. The
water molecule is written H~2~O, and the carbonate ion is CO~3~^2-^, which
shows how a subscript and a superscript can appear in the same fragment.

Powers are the classic superscript case: two to the tenth power is 2^10^, and
the size of a dataset is often quoted as a count times 10^9^ entries. The
marker pair is deliberately lightweight so that plain prose stays legible.

Authors also use ==highlighted== spans to draw attention to a term without
turning it into a link. In a review draft, a ==changed clause== is easier to
spot than an underlined sentence, and it survives copy and paste into a
plain-text editor.

The same conventions appear in chemistry, physics and typography notes: a
subscript marks an index, a superscript marks an exponent or a charge, and a
highlight marks something the reader should not miss. Each of these is a
==single inline span== that the parser must recognize without swallowing the
surrounding words.

Finally, closing tags must appear immediately after their content so that the
span does not leak into the following sentence.

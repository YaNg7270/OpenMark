# Currency Amounts That Look Like Mathematics

Prices are the classic trap for a dollar-based maths tokenizer, because a
currency amount and a formula both begin with the same character. This
fixture collects the tricky shapes on purpose.

A budget sentence may read that the base model costs $20 and the upgraded
model costs $30, with the difference going to storage.

The two amounts in that sentence are separated by ordinary words, so no
closing delimiter is ever adjacent to the text that precedes it.

A discount list often runs the amounts together, as in $10,$20 for a pair of
tickets bought together at the counter.

A promotion might advertise three tiers as $5, $10, $15 for small, medium
and large sizes respectively.

In each of these lines the expected output is plain text, because a real
formula is not intended and the surrounding prose is ordinary commercial
writing.

Numerals after a dollar sign are read as quantities of money, and the
document must render them exactly as typed.

No mathematical expression appears anywhere in this file, and no backslash
command is used, so the only interesting characters are the currency signs
themselves.

A shopkeeper writing on a chalkboard might list two prices side by side,
and a reader skimming the board should never see a square root appear where
a sum of money was meant.

The safest rule for an author is to avoid surrounding a bare numeral with
dollar signs unless a formula is genuinely intended.

The test for this fixture simply renders the document and inspects the
result, checking that every amount appears as ordinary text.

Nothing here should change from one rendering engine to the next.

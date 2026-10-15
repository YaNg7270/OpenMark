# 价格列表与货币符号

Prices: $5, $10, $15

上面的这一行是一个纯粹的价格列表，三个数字分别对应小杯、中杯和大杯的价格。The dollar signs here are currency markers rather than delimiters for a formula, so they must remain literal text in the rendered output.

在英文技术文档里，货币符号与 Markdown 的数学定界符共用同一个字符，这给解析带来不小的麻烦。A tokenizer that naively treats every dollar sign as a maths opener would turn the list above into a garbled formula.

因此，本文件专门用来验证这种边界情况。The expected behaviour is that all three amounts survive unchanged, and that no mathematical rendering is produced anywhere in this file.

价格文案通常还会把货币符号与数字紧挨着写，a price tag 中间也可能插入中文说明，例如大杯十五元、小杯五元，这样的写法必须原样保留。

Mixed prose of this kind is common in bilingual documentation, where an English term like price list sits next to Chinese explanation without any change of meaning.

A second line repeats the same three figures in a different order, since $5, $10, $15 and its reverse should both be treated identically.

最后一段再次强调，本文件不含任何真正的数学公式，唯一的特殊字符就是那三个美元符号。

The list is short on purpose, so that any unexpected rendering is easy to
spot when the document is inspected by hand rather than by an automated
checker.

价格列表在电商页面、账单和促销海报里都很常见，因此解析器必须能够稳定地处理它们，而不会把金额误读成公式。

A parser that mistakes the leading sign for an opening delimiter will often
consume text until it finds another sign much later in the paragraph, which
produces a spectacular failure.

为了降低这种风险，很多实现会要求公式内部至少出现一个反斜杠命令或者一个运算符，否则就当作普通文本处理。

The examples above contain neither, which is why they should be treated as
plain currency rather than as mathematics in every case.

本文件不包含任何真正的公式，全部内容都是普通的价格说明与双语叙述，适合用来做渲染回归测试。

A second reviewer may compare the source file with the rendered page and
confirm that the three amounts appear in the order in which they were typed.

The currency signs are the only unusual characters in the whole file.

Everything else is ordinary prose.

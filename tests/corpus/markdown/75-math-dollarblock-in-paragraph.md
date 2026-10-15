# 段落中的行内公式块

有些作者习惯把较短的公式直接写在句子中间，而不是另起一行，这种写法在混合了中英文术语的文档里尤其常见。

在讨论排序复杂度时，一句话可以写成：由于 $$O(n \log n)$$ 的增长速度足以覆盖大多数实际数据规模，因此归并排序仍然是工程上的稳妥选择。

这句话在公式前后都保留了中文叙述，the surrounding prose mixes Chinese characters with Latin terms such as sorting and complexity.

再看一个概率的例子：如果每次实验成功的概率是 $$p = 0.5$$，那么连续两次成功的概率就是四分之一。

这一段同样把公式嵌在了句子中间，and neither display breaks the line that contains it, so the tokenizer can still recognise both pairs.

本文件一共包含两个这样的公式块，它们都出现在段落的中间位置，而不是独占一行。

The mixed style is deliberate here, because bilingual technical writing often switches between scripts within a single sentence without any formal marker to announce the change.

这种写法对渲染引擎提出了更高的要求，因为定界符必须与普通文字区分开来，而不能依赖它是否独占一行。

A second concern is spacing: the source keeps a single space on each side of
the display so that the surrounding Chinese text does not touch the
delimiters directly.

如果句子很长，读者往往会忽略公式本身的位置，因此作者通常会把变量名写在公式之外的正文里加以解释。

The final check is that the two displays remain on their own lines within
the paragraph, because a line break inside either pair would break the
expected result.

整体来看，这是一份用于边界测试的小样本，既包含中文叙述，也包含英文术语与公式块。

The mixture is intentional and mirrors what happens in real bilingual
notes, where a single paragraph can switch scripts several times.

以上两个公式块是本文件唯一需要计数的对象。

两个公式块的左右两侧都保留了空格，这样在纯文本编辑器里也能一眼看出它们的位置。

The paragraph frame keeps the formulas readable even before rendering.

上述写法在中文技术博客里相当普遍。

两个例子都保持在同一行内。

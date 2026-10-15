# 表格嵌套在列表项中

Sometimes a table belongs to one specific bullet rather than to the
whole document, so it is indented to the content column of the list
item and travels with that item.

- 第一种方案：使用内存队列 (in-memory queue) 缓冲写入请求，下表列出它的关键参数与默认取值。

  | 参数 parameter | 默认值 | 作用 |
  | --- | --- | --- |
  | capacity | 1024 | 队列最大长度 |
  | flush interval | 50ms | 批量落盘周期 |
  | backpressure | on | 队列满时阻塞生产者 |

  这种方案实现简单、延迟很低，但进程崩溃时会丢失尚未落盘的数据，因此更适合可重放的场景。

- 第二种方案：写入前先落 WAL (write-ahead log)，再由后台线程回放，可靠性更高，代价是额外的磁盘写入与恢复时间。

The table above is the only one in this document. Its lines are
indented by two spaces so that they line up with the first character of
the bullet text, not with the dash.

A parser should open the list item, then open a table inside it, then
close both when the next bullet arrives. Getting the indentation wrong
would either break the list or turn the table back into plain
paragraphs.

Indentation is the whole game here. Two spaces line the table up with
the bullet text, four spaces would line it up one level deeper, and a
misplaced character can drop the whole block out of the list entirely.

A quick sanity check is to convert the outer list into a nested one. If
the table follows its parent item, the conversion should succeed; if it
sticks to the document root, the indentation was too shallow.

Both ideas above are ordinary engineering trade-offs, and the single
table exists only to show where a tabular detail belongs when the rest
of the section is prose.

The list itself stays flat on purpose, so the nesting under test is the
table and nothing else.

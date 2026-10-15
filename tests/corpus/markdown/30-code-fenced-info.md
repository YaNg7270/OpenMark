# Fenced Code With Info Strings

An info string follows the opening fence and tells the highlighter
which language the block contains. The three blocks below use three
different info strings, so three tokenizers are requested.

```js
const cache = new Map();

export function memo(fn) {
  return (key) => {
    if (!cache.has(key)) cache.set(key, fn(key));
    return cache.get(key);
  };
}
```

```python
def chunk(seq, size):
    for start in range(0, len(seq), size):
        yield seq[start:start + size]
```

```xml
<config>
  <server host="localhost" port="8080"/>
  <cache enabled="true" size="64"/>
</config>
```

Each info string is a single word, so the highlighter receives an
unambiguous language name. The body of every block is ordinary text as
far as the Markdown parser is concerned, and only the fence lines mark
the boundaries of the block.

A parser should report exactly three code blocks here, and it should
attach the info string to each one without inspecting the contents.

Nothing else in this file opens a fence, so the block count is exactly
three for any correct reader.

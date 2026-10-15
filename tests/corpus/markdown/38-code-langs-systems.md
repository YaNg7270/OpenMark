# System Languages

The blocks below show small tasks implemented in four languages. Each
block has at least six lines of realistic code, so a highlighter has
enough material to tokenize.

```js
function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

const numbers = [1, 2, 3, 4];
console.log(sum(numbers));
```

```ts
interface Point {
  x: number;
  y: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
```

```python
def running_total(values):
    total = 0
    result = []
    for value in values:
        total += value
        result.append(total)
    return result
```

```rust
fn sum(values: &[i32]) -> i32 {
    let mut total = 0;
    for value in values {
        total += value;
    }
    total
}
```

Each snippet is self contained and short enough to read at a glance,
while still long enough that the highlighter has something to work
with. The four info strings differ, so four separate language modes are
requested.

The bodies contain no Markdown tables, lists or headings, so the only
interpreted lines are the six fence lines that open and close the
blocks.

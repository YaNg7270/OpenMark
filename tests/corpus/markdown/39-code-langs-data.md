# Data And Service Languages

The five blocks below cover a small Go helper, a Java class, a SQL
query, a YAML configuration file and a JSON payload. Each info string
names a different language.

```go
package main

import "fmt"

func main() {
    total := 0
    for i := 1; i <= 10; i++ {
        total += i
    }
    fmt.Println(total)
}
```

```java
public class Counter {
    private int total;

    public void add(int value) {
        this.total += value;
    }

    public int value() {
        return total;
    }
}
```

```sql
SELECT o.id, o.total, c.name
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
WHERE o.created_at > '2024-01-01'
ORDER BY o.total DESC;
```

```yaml
server:
  host: localhost
  port: 8080
cache:
  enabled: true
  size: 128
```

```json
{
  "name": "sample",
  "version": "1.0.0",
  "dependencies": []
}
```

Each block uses a different info string, so five tokenizers are
requested. The contents are ordinary literal text and contain no
Markdown tables, lists or headings, which keeps the fixture focused on
fence handling alone.

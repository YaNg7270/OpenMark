# Web And Build Languages

The four blocks below cover a shell command, a unified diff, an HTML
fragment and a short CSS rule set.

```bash
set -euo pipefail

mkdir -p dist
cp -r public/* dist/
echo "build complete"
```

```diff
@@ -1,5 +1,6 @@
 function greet(name) {
-  return "hello " + name;
+  const prefix = "hello ";
+  return prefix + name;
 }
```

```html
<section class="card">
  <h2>Release notes</h2>
  <p>Version 2.0 is available.</p>
  <a href="/download">Download</a>
</section>
```

```css
.card {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 16px;
}
```

The diff block contains lines that begin with plus and minus signs,
which are literal characters inside the fence and carry no list meaning
there. The HTML block contains tags, but because it is fenced they are
shown as text rather than parsed as markup.

Four fences and four info strings means exactly four code blocks should
be reported for this file.

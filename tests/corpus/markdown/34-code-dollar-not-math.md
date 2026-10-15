# Dollar Signs Inside Code

Dollar characters mean nothing to a Markdown parser. They only become
special when a math extension is enabled, and even then only outside
code blocks. The two JavaScript blocks below are therefore ordinary
code, not formulas.

```js
// Shell style prompts recorded in a tutorial comment
// $ npm install
// $ npm run build
const version = process.env.npm_package_version;
console.log("installed version " + version);
```

```js
const price = "$12.50";
const total = "$$" + price;
const id = $("#main .item").first().data("id");
console.log(id, total);
```

Inside a fenced block every dollar sign is literal text. A math aware
renderer must suppress its math rules for the whole block, otherwise it
would try to parse the shell prompt comment and the currency strings as
delimiters. This fixture exists precisely to catch that mistake.

The rule is simple to state: fenced code always wins. An extension that
scans the whole document for dollar runs before parsing fences will
produce the wrong result on this file.

A simpler renderer might decide that a dollar run followed by text and
another run forms a formula, and scan straight through fence lines.
That heuristic fails twice here, because the comment block contains a
prompt and the code block contains currency strings.

The ordering rule is worth repeating: block structure is resolved
first, inline structure second. Anything inside a resolved code block
is opaque to every inline rule, and fixtures like this keep that
ordering honest.

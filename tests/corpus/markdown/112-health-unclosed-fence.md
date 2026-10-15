# Health Check: Unclosed Fence

A fenced code block starts with three backticks and a language tag, and it ends
with three backticks of its own. This file deliberately omits the closing fence
so that a parser must decide what to do with the rest of the document.

```js
function greet(name) {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "hello, stranger";
  }
  return "hello, " + trimmed;
}

const message = greet("world");
console.log(message);

The fence above was never closed, so every line that follows is swallowed as
code. That includes this sentence, the heading that a careless author might
expect to see after it, and any paragraph that was meant to be ordinary prose.

## A Heading That Is Actually Code

Even a heading marker has no special meaning inside an open fence. The text you
are reading is part of the same code block, which is exactly the failure mode
this fixture is built to reproduce.

A health check should flag the file as malformed and point at the opening fence
line, while still producing a best-effort block that contains all trailing text.

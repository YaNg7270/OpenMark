# Web 安全：同源策略、CSP 与 XSS/CSRF

Web 安全的攻防大多围绕一个核心问题展开：浏览器愿意相信谁。同源策略（same-origin policy）划定了默认边界，CSP 用来收紧资源加载，而 XSS 与 CSRF 则是两种最经典、也最容易被低估的攻击手法。

## 同源策略

两个 URL 只有在协议、主机、端口三者完全一致时才算同源。任何跨源的读取行为默认都会被浏览器拦截，除非目标显式同意。

| 维度 | 示例 A | 示例 B | 是否同源 |
| --- | --- | --- | --- |
| 协议 | https | http | 否 |
| 主机 | api.foo.com | www.foo.com | 否 |
| 端口 | 443 | 8443 | 否 |

同源策略只约束「读取」，不约束「发送」，这一点是理解 CSRF 的关键。跨源共享需要 CORS，而配置 `Access-Control-Allow-Origin` 时务必使用白名单，绝不能盲目回显来源并同时允许携带凭证。

## CSP

内容安全策略（Content Security Policy）通过响应头限制页面能加载哪些脚本、样式与图片。

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-r4nd0m'; object-src 'none'
```

- 用 nonce 或 hash 取代 `unsafe-inline`，才能真正挡住注入脚本；
- `object-src 'none'` 可以关掉历史遗留的插件入口；
- 建议先用 report-only 模式观察，再切换成强制模式。

> CSP 的价值在于纵深防御：即使某处转义漏了，攻击者也未必能执行脚本。

## XSS 与 CSRF

XSS（跨站脚本）的根因是用户输入被当作代码执行，因此修复方向永远是「在正确的上下文里做转义」，而不是过滤关键字。现代前端框架默认会转义插值，真正危险的是 `innerHTML`、`dangerouslySetInnerHTML` 这类显式逃逸出口。

CSRF（跨站请求伪造）利用的则是「浏览器会自动带上 Cookie」这一特性。防线有三层：

1. SameSite=Lax 或 Strict 从源头限制跨站携带 Cookie；
2. 关键操作校验 Origin 与 Referer；
3. 对状态变更请求使用一次性 token 或自定义头部。

## 输入校验与最小权限

除了上述三类攻击，日常还容易忽略输入校验与权限边界。服务端永远要把客户端传来的数据当作不可信输入，做类型与范围校验；数据库账号与令牌则遵循最小权限原则，只授予业务真正需要的能力。

- 白名单胜过黑名单，前者不会因为出现新字符而失效；
- 权限判断必须放在服务端，前端隐藏按钮只是体验优化；
- 敏感信息不要出现在 URL、日志或错误堆栈里。

## 小结

同源策略是默认安全，CSP 是纵深防御，XSS 与 CSRF 提醒我们：只要把用户输入或跨站请求当成可信，边界就会立刻失效。

# KNOWN ISSUES

OpenMark 的已知问题与未实现功能。**每一条都经过代码核对**：写明现象、复现方式（或代码依据）、
未完成的部分、以及可行的规避方法。没有复现或没有代码依据的猜测不写在这里。

- 核对时间：2026-10-16。最近一轮补齐了无障碍审核（axe-core 已纳入测试）。（已修复的条目会从本文档移除：截图回归基线、阅读模式查找替换、
  `Cargo.toml` 的 MSRV 声明都已在本轮补齐。）
- 对应的测试结果见 [`TEST_REPORT.md`](TEST_REPORT.md)
- 功能对照表见 [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md)

> 本文档只记录**当前仍然存在**的问题。前几轮修复掉的缺陷（协议往返风险、CRLF 被改写、
> 公式源码被破坏、诊断代码悬空等）已从本文档移除，其回归测试保留在测试套件中。

---

## P0 — 阻断性问题

**无。** 当前没有已知的、会阻止正常使用或造成数据丢失的问题。

---

## P1 — 影响核心目标，但有可行替代

### P1-1 MSI 安装包未经安装测试，且两个安装包都未签名

**现象**：NSIS 安装包（`OpenMark_0.1.0_x64-setup.exe`，8,911,640 字节）已实测安装、启动、
卸载，卸载后安装目录、开始菜单快捷方式、卸载注册表项均被清理。**MSI 包没有做同样的测试**——
它是 `ALLUSERS=1`（按机器安装），需要提权，当前环境无法自动完成。

两个安装包都是 `NotSigned`。本机构建的副本没有 Mark-of-the-Web，所以安装时不会弹 SmartScreen；
**从互联网下载的副本会弹出"Windows 已保护你的电脑"**，发布者显示为未知。

**规避**：优先分发便携版（`OpenMark-0.1.0-portable.zip`），它不需要安装。
**未完成**：MSI 安装测试；代码签名证书（这是消除 SmartScreen 警告的唯一途径）。

---

## P2 — 影响体验、合规或可维护性

### P2-1 MathJax 的语义增强默认关闭

**现象**：MathJax 4 默认启用语义增强、语音与盲文，这会启动一个 SRE Web Worker 并拉取
mathmaps。实测中它与排版过程竞争，使渲染结果不确定。因此默认关闭：
`enableSpeech: false`、`enableBraille: false`、`enableEnrichment: false`。

**影响**：屏幕阅读器得不到 MathJax 的语义增强。SVG 输出本身仍保留结构，占位元素带
`role="math"`，所以基础可访问性不受影响。

**依据**：`src/core/math/mathjax.ts` 的 `options` 段；SRE 数据已随应用打包
（`public/mathjax/v4/sre/`），因此开启它不需要联网。

**已完成的部分**：已用 axe-core 做了无障碍审核，并把审核纳入测试套件
（`tests/e2e/a11y.spec.ts`，6 个用例，覆盖外壳、四种视图、所有侧栏面板与两个对话框）。
审核发现并修复了 7 个真实问题，其中影响最大的是公式与图表的 SVG 带 `role="img"` 却没有可访问名称——
禁用语义增强后，正常提供名称的机制也随之关闭了。现在每个公式以它的 LaTeX 源码作为名称，
图表以其自身标签生成描述。

**未完成**：显式处理 SRE Worker 的生命周期后重新启用语义增强，让公式能被「朗读」而不是「读出源码」。

### P2-2 性能有测量、没有门限

**现象**：`scripts/perf-parse.mjs` 能给出每个压力样例的解析耗时、吞吐与堆增长，但**没有断言**，
也没有接入 CI。排版（MathJax / Mermaid / Shiki）不在测量范围内。

**已知数字**：3 MB 教材 176 ms；40×2000 的宽表格 455 ms，其中 markdown-it 自身的分词占 143 ms。
详见 [`TEST_REPORT.md`](TEST_REPORT.md) §5。

**未完成**：门限与回归检测；排版侧的性能测量。

### P2-3 安装包目标里含一个 macOS 专属项

**现象**：`bundle.targets` 包含 `"app"`，这是 macOS 的 bundle 目标。tauri-bundler 2.10.3 在
Windows 上会忽略它并打印一条警告。

**影响**：只是噪音，不影响产物。

**依据**：`src-tauri/tauri.conf.json`；构建日志中的 bundler 警告。

### P2-4 没有自动更新

**现象**：应用不会检查新版本。`tauri-plugin-updater` 未接入，也没有更新端点。

**影响**：升级需要用户手动重新安装。

**未完成**：更新端点、签名密钥与更新流程。这需要一个本项目没有的外部服务。

### P2-5 `evaluateReadOnly` 的判定范围很窄

**现象**：安全只读只在三种情况下触发：文件超过阈值（默认 512 KB）、存在结构性错误
（未闭合围栏、未闭合 `$$`、非法 UTF-8）、或文档以原始 HTML 为主。

**影响**：一个 400 KB、语法完全正确但作者并不想被改写的文件会以可编辑模式打开。
这是有意的取舍——过宽的判定会让正常文件无法编辑——但它不是"不可信文件保护"。

**依据**：`src/app/store.ts` 的 `evaluateReadOnly`。

---

## P3 — 低影响、文档漂移与环境限制

### P3-2 Windows 文件关联已配置，但未做双击实测

**现象**：`tauri.conf.json` 注册了 `.md` / `.markdown`，Rust 侧有 argv 解析、单实例转发与
`frontend_ready` 回放管道，桌面 E2E 也通过 `openmark://open-file` 事件验证了这条管线。
**但没有在安装后双击一个 `.md` 文件实测过。**

**依据**：`src-tauri/tauri.conf.json` 的 `fileAssociations`；
`src-tauri/src/lib.rs` 的 `markdown_paths` / `frontend_ready`；
`tests/desktop/openmark.spec.ts` 的 "opens the fixture through the shell open-file event"。

### P3-3 MathJax 4 无法在 Windows 的 Node 下运行

**现象**：MathJax 4 的 Node 组件加载器会把 `D:/…` 这样的裸路径交给 `import()`，而 `import()`
要求 `file://` URL，因此在 Windows 上直接失败。

**影响**：这是 MathJax 的平台缺陷，不是本项目的。后果是公式渲染**只能在浏览器中验证**：
Vitest 覆盖分词与诊断，Playwright 与 WebdriverIO 覆盖真实排版。

**依据**：`vitest.config.ts` 顶部注释；`src/core/math/mathjax.ts` 的模块注释。

### P3-4 环境与依赖限制

这些都会浪费你的时间，逐条都已验证：

1. **本 shell 无法解析 PATH 中含空格的目录下的可执行文件**，而仓库路径正好含空格。
   `cargo`、`rustc`、`tsc` 作为裸命令都会失败。用绝对路径，或 `source scripts/env.sh`。
2. **Rust 是项目本地安装的**（`.tools/`），不在 PATH 上。`@wdio/tauri-service` 会因此报
   "Rust toolchain not found"；`scripts/run-desktop-e2e.mjs` 已经处理。
3. **上游 crates.io 从本网络只有约 5 KB/s**，cargo 走 `rsproxy.cn` 镜像（`.tools/cargo/config.toml`）。
   `static.rust-lang.org` 同样慢，rustup 从 `rsproxy.cn` 装。
4. **用户级 `~/.npmrc` 指向 npmmirror**，它比上游滞后并会导致安装失败
   （`create-wdio@10.0.2` 缺失）。项目级 `.npmrc` 覆盖为官方源。
5. **`vite preview` 必须显式 `--host 127.0.0.1`**，否则它绑定 IPv6 的 `localhost`，
   而 Playwright 的就绪探测轮询 IPv4 字面量，服务器正常但探测超时。
6. **残留的 `openmark.exe` 会让新进程立刻退出**（单实例插件转发），驱动会把它报成
   "Chrome instance exited"。跑桌面 E2E 前先结束残留进程。
7. **`C:\omkth` 是一个指向 `<repo>\.tools` 的目录联接**，为了让 tauri-driver 拿到不含空格的
   可执行路径。用 `rmdir C:\omkth` 删除；普通构建不需要它。

### P3-5 便携版是"组装"的，不是原生目标

**现象**：tauri-bundler 没有 `portable` 目标（`BundleType` 只有
`deb|rpm|appimage|msi|nsis|app|dmg`）。便携版由 `tauri build --no-bundle` 加上
`app.appDirectoriesOverride` 组装而成。

**已验证**：解压后启动 `openmark.exe`，配置与 WebView2 用户数据确实落在可执行文件旁的
`data/` 目录。

**依据**：`src-tauri/tauri.portable.conf.json`；`pnpm desktop:build:portable`。

### P3-6 `docs/FEATURE_MATRIX.md` 可能滞后

**现象**：该文档在编辑功能完成**之前**写的，其中若干行仍标为 Planned（表格编辑、图片粘贴、
多标签页、打字机模式等），而这些现在已经实现。

**影响**：只是文档滞后，不是产品缺陷。`PROGRESS.md` 与本文档是更新的。

**未完成**：对照代码逐行复核 `FEATURE_MATRIX.md` 的 Status 列。

---

## 记录模板（新增问题时请沿用）

```markdown
### P<级别>-<序号> <一句话标题>

**现象**：用户看到什么、什么时候发生。

**为什么重要**：影响哪个目标/承诺。

**依据**：`文件:行` 或可复现的步骤。

**规避**：现在能怎么办。

**未完成**：缺什么才能修好。
```

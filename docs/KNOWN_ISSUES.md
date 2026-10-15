# OpenMark 已知问题与未实现功能

本文如实记录**当前代码里**尚未实现、只是部分实现、或存在缺陷的地方。每条都给出：现象、
复现方式（能复现的）、具体没做完的是什么、以及可用的规避方法。

**收录标准**：只收录我在 `src/`、`src-tauri/`、`tests/` 或配置文件里核对过的问题。
凡是我无法在本环境复现的，会在条目里**显式标注「未验证」**并说明依据来源。

**分级**：P0 = 阻断使用；P1 = 影响核心目标，但可用；P2 = 影响体验、合规或可维护性；
P3 = 低影响、文档漂移或环境限制。

> 本文与 `PROGRESS.md` §4 的关系：`PROGRESS.md` 在本文件写作期间刚被更新过，其 P1 列表
> （表格编辑与图片粘贴未实现、无标签页、打字机模式只有设置、桌面端 E2E 尚未证明为绿）与
> 我的核对结论一致，因此不再逐条复述。本文另外收录了 `PROGRESS.md` **没有**提到的部分
> （设置项未接线、只读无法解除、`typecheck:node` 不可运行、便携构建无入口、死代码等）。
> 仍不一致的地方集中在 §P3-5「文档漂移」。

---

## P0 — 阻断性问题

**无。** 应用可以构建、以真实 Windows 桌面二进制启动，能正确读取 Markdown、离线渲染
LaTeX 与化学式并保存文件。

---

## P1 — 影响核心目标，但有可行替代

### P1-1 编辑能力仍明显小于目标

**现象**：目前只有四种视图模式 + 块级编辑，写作类功能缺失。

**已实现（核对过代码）**：

- 阅读模式（非编辑）、即时渲染（点块就地编辑）、源码模式（CodeMirror 6）、分屏模式；
- 源码模式有 Markdown 语法高亮、行号、活动行、括号匹配、多光标、矩形选择、自动缩进、
  编辑器内的查找/替换、撤销/重做；
- 阅读视图有文中搜索（只读，用于查找与跳转）。

**未实现**：

- 源码/阅读视图之间统一的**替换**功能（阅读视图的搜索面板只有查找与跳转，没有替换）；
- 表格编辑；
- 图片粘贴、拖入插入、资源管理；
- 多标签（每个文档一个窗口/一份状态）；
- 缩放手势与 `Ctrl+滚轮`；
- 崩溃恢复界面（备份文件已生成，但没有「恢复未保存草稿」的入口）。

**规避**：在源码模式里直接编辑；查找用各自视图的 `Ctrl+F`。

> `PROGRESS.md` §4 P1 的当前版本把这一条表述为「表格编辑与图片粘贴未实现」「无标签页」，
> 与本节一致。

### P1-2 部分设置项只有数据结构，没有 UI 也没有效果

**现象**：`src/app/settings.ts` 里存在这些字段，但全仓库没有任何地方读取它们：

| 字段 | 默认值 | 现状 |
|---|---|---|
| `reading.showOutline` | `true` | 无控件；大纲面板是否显示完全由手动开关决定 |
| `reading.typewriterMode` | `false` | 无控件、无任何 CSS 或组件读取它 |
| `editor.tabSize` | `2` | 无控件；源码编辑器的缩进用 CodeMirror 默认值 |
| `editor.showLineNumbers` | `false` | 无控件；源码编辑器**始终**显示行号 |

**复现**：在 `设置` 面板里找这四项——不存在。全仓库 grep 字段名，只有 `settings.ts`
自身命中。

**规避**：无。行号如果需要关闭，目前没有办法。

### P1-3 两个 store 动作没有任何 UI 入口

**现象**：`useStore` 暴露的 `newDocument`（新建空白文档）与 `saveAs`（另存为）没有对应的
按钮或快捷键：

- `newDocument`：全仓库只有声明与实现，没有任何调用点；
- `saveAs`：只被 `save()` 在「文档没有路径」时内部调用，因此只有在未命名的新文档上按
  `Ctrl+S` 才会看到「保存为」对话框。

**规避**：想另存为，先用「最近打开」或 `Ctrl+O` 换文件；想新建，可从外部创建一个空
`.md` 再打开。

### P1-4 相对本地链接不会跳转到文件

**现象**：点击 `[下一章](./next.md)` 不会打开目标文档，状态栏弹出
「本地链接：next.md（编辑里程碑中实现文件跳转）」。

**依据**：`src/App.tsx` 的 `handleLink`——`#锚点` 与 `http(s)/mailto` 都有实现，其余分支
只发一条通知。

**规避**：用 `Ctrl+O` 或「最近打开」切换文件。

### P1-5 安全只读模式无法解除，且与代码注释不符

**现象**：文档命中安全只读判定后，界面上**没有**任何「解除只读/仍要编辑」的按钮或口令。
唯一出路是在 `设置 → 行为` 关闭「复杂文件使用安全只读模式」，然后重新打开文件；由于打开
时才重新判定，正在打开的这份文档不会即时解锁。

**代码注释与实现不一致**：`src/app/store.ts` 中 `evaluateReadOnly` 的文档注释声称
「the user can always unlock editing explicitly」（用户总能显式解除编辑限制），但全仓库
**没有任何** setter / 动作把 `doc.readOnly` 改回 `false`（grep `setReadOnly`、
`readOnly = false`、`unlock` 均无命中）。

**额外问题**：大文件的阈值（`safety.largeFileThresholdBytes`，默认 512 KiB）**没有** UI，
因此「因为文件太大而只读」的文档只能通过关闭整个安全只读开关来编辑。

**复现**：打开一个 > 512 KiB 的 `.md`，状态栏显示「安全只读」，悬停可见原因；尝试编辑
被拒。

**规避**：见上。

### P1-6 便携构建实际上不可达

**现象**：`pnpm desktop:build:portable` 执行的是 `tauri build --no-bundle`，**没有**传
`--config tauri.portable.conf.json`，因此 `appDirectoriesOverride: "data"` 永远不会生效，
产出的只是「不打包安装器」的普通构建，数据仍写在系统位置。

**依据**：`package.json` 的 `desktop:build:portable` 脚本内容与
`src-tauri/tauri.portable.conf.json` 的存在。

**规避**：手动执行
`node_modules/.bin/tauri.CMD build --no-bundle --config src-tauri/tauri.portable.conf.json`。

**附注（实测）**：磁盘上**确实存在**一份便携包——
`src-tauri/target/release/portable/OpenMark-0.1.0-portable/`（含 `openmark.exe`、`README.txt`
与同级的 `OpenMark-0.1.0-portable.zip`，zip 为 10,039,070 字节，构建于 00:40）。但仓库里
没有任何脚本或 npm script 会产出它（全仓库 grep `portable` 只命中 `package.json` 与
`tauri.portable.conf.json`），因此它是在脚本之外手工构建的：便携能力可用，但**没有可复现的
构建入口**。

### P1-7 `pnpm typecheck:node` 无法运行

**现象**：`package.json` 的 `typecheck:node` 指向 `tsconfig.node.json`，而该文件**在仓库中
不存在**（`ls tsconfig*` 只有 `tsconfig.json` 与 `tsconfig.desktop.json`），脚本必然失败。

**复现**：`pnpm typecheck:node`。

**说明**：`tsconfig.desktop.json`（为 `tests/desktop` 配置 WebdriverIO 与 Node 类型）此前
没有任何脚本引用它，后来由 `typecheck:desktop` 接上；也就是说该配置**已不再**是孤儿。剩下的
问题只是这条 `typecheck:node` 本身。

**规避**：不要运行它；`pnpm verify` 里的 `typecheck` 走的是 `tsconfig.json`，不受影响。
需要检查桌面套件类型时用 `pnpm typecheck:desktop`。

---

## P2 — 影响体验、合规或可维护性

### P2-1 MathJax 的无障碍特性默认关闭

**现象**：语义增强（semantic enrichment）、语音朗读（speech）与盲文（Braille）默认全部
关闭，MathJax 的右键菜单里对应的四个开关也初始为 `false`。

**原因（来自代码注释，非推测）**：MathJax 4 默认开启这些特性，会启动一个 SRE Web Worker
并在每份文档上拉取 mathmaps；这项工作和排版并发，使渲染在测试中变得**不确定**。对一个
必须稳定的阅读器来说这是不可接受的取舍。

**代价与现状**：

- 屏幕阅读器拿不到语音/盲文输出；
- 但**基本无障碍未受影响**：公式占位符带 `role="math"`，SVG 输出保留 MathJax 自身的结构；
- SRE 的 payload 已经被 vendor 到 `public/mathjax/v4/sre/`，一旦把 worker 生命周期显式
  管理起来，就可以在设置里开启——目前**没有**这个设置项。

**依据**：`src/core/math/mathjax.ts` 的 `options` 配置块；`src/core/markdown/placeholders.ts`
的 `role="math"`。

### P2-2 `src-tauri/Cargo.toml` 声明的 MSRV 是错的

**现象**：应用清单声明 `rust-version = "1.77.2"`，而它依赖的 `tauri` 2.12.4 与
`tauri-build` 2.7.3 都声明 `rust-version = "1.90"`。

**后果**：本机装的是 Rust 1.99，所以构建正常、不影响使用；但这个值会误导任何按清单
准备工具链的人（例如 CI 会照它去装 1.77，然后编译依赖时失败）。

**依据**：`src-tauri/Cargo.toml:8` 与 `.tools/cargo/registry/src/*/tauri-2.12.4/Cargo.toml`、
`tauri-build-2.7.3/Cargo.toml` 中的 `rust-version`。同一个不一致在 `docs/RESEARCH.md`
§9.2「Inconsistency found in-repo: declared MSRV」里已有记录（建议值同样是 `1.90`）。

### P2-3 诊断代码的覆盖远低于声明数量

**当前事实（逐个 grep 发出点核对）**：`src/core/markdown/types.ts` 声明 **29** 个
`DiagnosticCode`，实际会被发出的是 **18** 个（清单见
[`USER_GUIDE.md` §5.2](USER_GUIDE.md#52-解析器实际会发出的诊断代码)）。

**未被发出的 11 个**：`unclosed-html-comment`、`duplicate-footnote`、
`setext-heading-ambiguity`、`math-unknown-macro`、`math-unbalanced-environment`、
`math-display-in-inline`、`bom-detected`、`crlf-detected`、`mixed-line-endings`、
`invalid-utf8`、`non-utf8-encoding`。

**相关文档已经过时（三处不一致）**：

| 出处 | 它写的 | 实际 |
|---|---|---|
| `PROGRESS.md` §4 P1-4 | 「28 个代码中只有 **15** 个会被发出」 | 29 声明 / 18 发出 |
| `docs/FEATURE_MATRIX.md` §6 | 「**6** 个代码已发出」并逐一列出 | 29 声明 / 18 发出 |
| `tests/corpus/README.md` | 「Emitted today by `engine.ts`」表只列 **4** 个 | 29 声明 / 18 发出 |

**对用户的影响**：诊断面板不会报告编码类问题（BOM/CRLF/混合换行/非法 UTF-8），即使检测
逻辑本身是正确的。未知宏（`\thisIsNotAMacro{}`）不会产生 `math-unknown-macro`，而是以
`math-render-error` 报告——这是有意设计（MathJax 才是权威），不是缺陷。

**规避**：无。

### P2-4 性能只有测量脚本，没有门限、没有接入、也不覆盖排版

**现象**：

- `tests/perf/` 是**空目录**，`package.json` 里**没有** `test:perf` 脚本（尽管
  `docs/TEST_STRATEGY.md` §2 Layer 5 以 `pnpm test:perf` 为入口）；
- 但 `scripts/perf-parse.mjs` **已经存在**（`node scripts/perf-parse.mjs`），对 5 个压力语料
  计时，测的是流水线的**同步**部分（打开文档与每次按键要跑的那段），并**显式排除排版**。

**因此仍然缺的是**：门限与回归断言（脚本只报告数字，不判成败）、`pnpm` 入口、浏览器侧的
排版/布局/滚动帧预算、内存上限与泄漏检查。

**压力语料已生成**（实测：`huge-textbook.md` 3,101,066 B、`math-dense.md` 562,357 B、
`deep-nesting.md` 195,888 B、`many-small-blocks.md` 1,120,038 B、`wide-tables.md`
650,788 B）。

**后果**：架构上「没有任意尺寸上限」的说法（占位符 + 懒排版 + 可取消）**尚无门限证明**——
打开 3 MB 教材、2000 个行间公式的耗时与内存占用没有可引用的数字（可以在本机跑
`node scripts/perf-parse.mjs` 得到解析侧的中位数，但那是单机单次观测，不是预算）。

### P2-5 `evaluateReadOnly` 里有一条死条件

**现象**：安全只读的结构性判定写作
`d.severity === 'error' && (code === 'unclosed-fence' || 'unclosed-math' || 'html-sanitized')`，
但 `html-sanitized` 在发出时是 **warning** 级（只有 `script-removed` 是 error 级），
因此该分支永远不会因 `html-sanitized` 触发。

**后果**：不影响用户可见行为（本来是"更严格才更好"的方向，这里只是没生效），但会误导
后续维护者以为「含被清洗 HTML 的文档会只读」。

**依据**：`src/app/store.ts` 的 `evaluateReadOnly`；`src/core/markdown/engine.ts:543-545`。

### P2-6 安装包目标里含一个 macOS 专属项

**现象**：`tauri.conf.json` 的 `bundle.targets` 是 `["nsis", "msi", "app"]`，其中 `app`
是 macOS 应用包格式，对 Windows 目标无意义（构建时会被跳过，属噪音）。

**后果**：无功能影响；仅增加困惑。

### P2-7 没有自动更新

**现象**：`tauri-plugin-updater` 不是依赖，也没有签名与更新源的配置。用户必须手动安装新
版本。

**说明**：`docs/FEATURE_MATRIX.md` §8 把自动更新标为 **Out-of-scope for v1**，理由是
`tauri-plugin-updater` 不是依赖、且签名前置条件尚未纳入预算（该行指向
`docs/RESEARCH.md` §9.7「Distribution signing」）。因此这是**有意**的取舍而非遗漏；
此处列出以免与「Typora 有自动更新」对比时被误读为缺陷。

---

## P3 — 低影响、文档漂移与环境限制

### P3-1 桌面端 WebdriverIO 套件：已在本机跑过一次，但**没有全绿证据**

**当前事实（我在 2026-10-16 01:05 核对）**：

- 套件真实存在：`tests/desktop/openmark.spec.ts` 有 **6 个**用例（启动真实二进制并渲染外壳、
  工具栏与文档名、通过 `openmark://open-file` 打开夹具、切到源码模式看到原始 Markdown、
  把行间公式排版成真实 MathJax 字形、把坏公式标为错误且保留源码）；
- 驱动配置 `tests/desktop/wdio.conf.ts` 存在，入口是 `pnpm test:desktop` →
  `scripts/run-desktop-e2e.mjs`（包装脚本把项目本地 Rust 工具链注入子进程 PATH，并显式把
  免空格的 `C:\omkth\cargo\bin\tauri-driver.exe` 交给服务，因为该服务用 `shell: true` 且不
  加引号，含空格的路径会被 cmd.exe 截断）；
- **已经留下一次运行的产物**：`tests/desktop/.wdio-logs/` 中有 2026-10-16 01:04 的日志 ——
  `tauri-driver` 就绪并监听 4444 端口、`msedgedriver 149.0.4022.62`（与 WebView2 149.0.4022.62
  匹配）已下载、环境自检 6 项通过、会话建立并执行到最后一条用例的末尾断言（查询
  `.om-math[data-om-state="error"]`，返回 MathJax 的 `Undefined control sequence
  \thisMacroDoesNotExist` / `Missing close brace`），随后正常 `deleteSession`。

**为什么我仍不声称它通过**：这些日志是 WebDriver 协议轨迹，**不含** mocha 的
`passing/failing` 汇总（grep `passing|failing|✓` 命中 0 行），所以我只能证明「驱动、匹配的
浏览器版本与会话都跑起来了」，**不能**证明 6 个用例全部断言成功。该套件的最终结论应由其
负责方给出。

**为什么这一层重要**：按 `docs/TEST_STRATEGY.md` §2 Layer 4 的设计，它负责的是「打包后的
应用在真实文件系统上的行为」——原子保存在真盘上、文件关联交接、外部改动冲突、便携构建、
真实二进制里的 MathJax 字形——这些**恰好是其余各层覆盖不到**的部分。
`PROGRESS.md` 也把「WebdriverIO 桌面端 E2E 尚未证明为绿」列为 P1。

**运行前置条件**（来自 `run-desktop-e2e.mjs`、`wdio.conf.ts` 与 `TEST_STRATEGY.md`
§2 Layer 4）：需要 `tauri-driver`（`cargo install tauri-driver --locked`，经 `C:\omkth`
可达）、版本匹配的 `msedgedriver`，以及 `src-tauri/target/debug/openmark.exe`
（`tauri build --debug --no-bundle`）。版本不匹配会**挂起**而不是报错。

### P3-2 Windows 文件关联：已配置，但未在最终构建中实测

**已核对**：`tauri.conf.json` 的 `bundle.fileAssociations` 为 `.md`/`.markdown` 注册了
`Markdown Document`（role `Editor`，mime `text/markdown`）；`src-tauri/src/lib.rs` 里有
`is_markdown`、`markdown_paths`、`PendingOpenFiles` 与 `frontend_ready` 的完整管道，窗口
以 `visible: false` 创建、等前端注册监听后再投递路径并显示。

**未验证**：安装 NSIS/MSI 之后双击 `.md` 是否真的会打开应用（`docs/FEATURE_MATRIX.md` 也
把它标为「Implemented (not yet verified in a build)」）。我没有执行安装，因此不做断言。

### P3-3 MathJax 4 无法在 Windows 的 Node 下运行（平台限制）

**内容**：MathJax 4 的 Node 组件加载器会把 `D:/…` 这样的裸 Windows 路径交给 `import()`，
而 `import()` 要求 `file://` URL，因此它在本平台的 Node 下无法启动。

**后果**：Vitest 只能覆盖分词与诊断，渲染一律由 Playwright 验证。这**不是**缺陷，而是一个
被明确接受的分工（`vitest.config.ts` 与 `src/core/math/mathjax.ts` 都有说明），它让单元测试
保持快速与确定。

**验证状态**：依据是代码注释与测试分层配置；我**没有**单独复现 MathJax 在 Node 下的启动
失败。

### P3-4 环境与依赖限制（都会浪费你的时间，逐条已验证）

| 限制 | 现象 | 规避 |
|---|---|---|
| PATH 中含空格的项无法作为裸命令解析 | 仓库路径是 `D:/OMP WorkSpace/REA typora`，因此裸 `cargo`、`rustc`、`tsc` 全部失败 | 用绝对路径或 `node node_modules/...` 调用，见 `README.md` 引导节 |
| Rust 工具链是项目本地的 | `cargo` **没有**全局安装 | `RUSTUP_HOME`/`CARGO_HOME`/`CARGO_TARGET_DIR` 指向 `.tools/` |
| 用户级 npm 镜像滞后 | `~/.npmrc` 指向 `registry.npmmirror.com`，缺少 `create-wdio@10.0.2`，安装直接失败 | **保留**项目根的 `.npmrc`（固定为 `registry.npmjs.org`），不要「简化」掉 |
| crate 上游极慢 | 直连 crates.io 实测约 5 KB/s（镜像约 7.9 MB/s） | **保留** `.tools/cargo/config.toml` 里的 `sparse+https://rsproxy.cn/index/` |
| 机器级 junction | `C:\omkth` → `<repo>\.tools` **确实存在**（已确认） | 普通构建不需要它；`rmdir C:\omkth` 可清理 |
| Playwright 依赖系统 Edge | 套件跑在 `msedge` 通道，不下载 Chromium | 需安装 Microsoft Edge（本机已确认存在于默认路径） |
| msedgedriver 版本不匹配会挂起 | 桌面套件（P3-1）的已知陷阱：不匹配时**挂起**而非报错 | `autoDownloadEdgeDriver: true` 或手动对齐 WebView2 版本 |
| PDF 导出仅 Windows | `export_pdf` 依赖 WebView2 的 `ICoreWebView2_7::PrintToPdf`；非 Windows 会得到 `pdf-unavailable` | 无（本项目就是 Windows 11 桌面应用） |
| Node 版本下限 | `package.json` 要求 `>=20.19` | 升级 Node |
| Vite preview 必须绑 IPv4 | `vite preview` 默认绑 `localhost`（在本机解析为 `::1`），而 Playwright 的就绪探针轮询 IPv4 字面量，会超时 | 配置里已固定 `--host 127.0.0.1`，不要去掉 |

### P3-5 文档漂移（内容过时，不是产品缺陷）

这些是**文档**与代码不一致，逐条已核对：

| 位置 | 它写的 | 实际（本次核对） |
|---|---|---|
| `PROGRESS.md` §1 验证表 | `openmark.exe` **13,833,728** 字节 | 磁盘上为 **14,473,216** 字节（重新构建过；NSIS 8,911,640 B、MSI 9,777,152 B 与它一致） |
| `PROGRESS.md` §1 里程碑「every declared diagnostic is now emitted」 | 「这也意味着 `DiagnosticCode` union 不再含有没有实现的目标项」 | 该里程碑的 **148/148** 指的是语料 manifest 声明的 **13** 个代码全部会被发出（这一条成立）；但 union 里仍有 **11/29** 个成员没有任何发出点，因此后半句不成立 |
| `tests/corpus/README.md` 的「Emitted today by `engine.ts`」表 | 只列出 **4** 个代码 | 29 声明 / **18** 发出 |
| `tests/unit/corpus.test.ts` 的确定性用例注释 | 称 markdown-it-task-lists 用 `Math.random()` 生成复选框 id，是「已知引擎缺陷、故意不掩盖」 | 已由 `engine.ts` 的 `renumberTaskItemIds` 修复（现按块命名空间 `task-item-b<i>-<n>` 生成确定 id），注释过时，不是缺陷 |
| `src/app/store.ts` 中 `evaluateReadOnly` 的注释 | 「the user can always unlock editing explicitly」 | 没有任何解除入口（见 P1-5） |
| 本文件（`KNOWN_ISSUES.md`）修订说明 | 曾写「`tests/desktop` 未见运行产物」 | 协作者随后在该目录留下了运行日志；已按 P3-1 改写为当前事实 |

> `PROGRESS.md` 在本文件写作期间被更新过：早先那几行「CodeMirror 6 尚待构建」「导出/打包
> 进行中」「只有 15/28 个诊断代码会被发出」**已被移除**，因此不再列为漂移项。上面保留的
> 都是**当前**文本里仍然不准确的部分。

### P3-6 死代码与「已实现但没接线」的接口

**a) 三个 i18n 字符串定义了但从未使用。** `status.readOnlyReason`、`error.openFailed`、
`toolbar.saveAs` 在 `src/i18n/index.ts` 的中英两套字典里都有，但全仓库没有任何组件使用它们
（结果：只读原因直接取自 `doc.readOnlyReason`；「无法打开文件」的标题是 `DocumentView.tsx`
里硬编码的中文；「另存为」没有任何界面文案）。

**b) 若干已导出、但当前没有任何调用点的函数**（均在 `src` **与** `tests` 中 grep 确认）：

| 函数 | 位置 | 备注 |
|---|---|---|
| `defaultDocumentsDir` | `src/core/fs/fileService.ts` | 对应的 Rust 命令 `default_documents_dir` 已注册，但打开/保存对话框都没用它（见 USER_GUIDE §1.1） |
| `pathExists` | 同上 | 没有任何调用点；存在性探测实际由 `statFile` 承担（外部改动轮询用它） |
| `validateDiagram` | `src/core/render/mermaid.ts` | 注释称「用于廉价地喂给诊断面板」，但诊断面板没有用它 |
| `clearDiagramCache` | 同上 | 没有任何调用点，因此缓存只在超过 200 条时按最旧条目淘汰（键为 `主题 + 源码`），不会在切换文档时清空 |
| `loadedLanguages` | `src/core/render/highlighter.ts` | 注释称「暴露给设置/诊断面板」，两者都没有用 |
| `exportStandaloneHtml`、`exportStandaloneHtmlToFile` | `src/core/export/html.ts` | store 只调用 `tryExportStandaloneHtml`；这两个是刻意保留的库入口（被 `index.ts` 再导出） |

**影响**：不改变任何用户可见行为，但会让人误以为某些能力已经被接上（例如「更换文档时图表
缓存被清空」）。

### P3-7 SQLite / 其它：不适用

本应用不使用数据库；无相关已知问题。

---

## 记录模板（新增问题时请沿用）

```
### P<级别>-<序号> <一句话标题>

**现象**：用户能观察到什么。

**复现**：最小步骤，或"依据：<文件>:<行>"（无法复现时）。

**未完成的部分**：具体缺什么（不要说"需要改进"）。

**规避**：可行的替代做法，或"无"。

**验证状态**：已核对代码 / 已实测 / 未验证（并说明依据来源）。
```

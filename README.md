# OpenMark

OpenMark 是一个运行在 Windows 11 上的离线 Markdown 阅读器与编辑器（Tauri 2 + React 19），
以 Typora 式的「即时渲染」与教材级的长文档阅读体验为目标。

它与同类工具的差别集中在三点：**公式真正离线渲染**（MathJax 4 SVG 输出，字形数据随应用
一起分发，渲染过程不发起任何网络请求）、**打开再保存不改变文件字节**（BOM、换行风格、
围栏信息串、YAML frontmatter 原样保留）、以及**为长文档阅读而设计的阅读面**（大纲、文中
搜索、阅读进度、上次阅读位置记忆、专注模式）。

> 本文档只描述代码里已经存在的行为。尚未实现的功能集中在
> [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md)，安装与使用说明见
> [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)。

---

## 截图

<!--
  待补充截图（请勿先写路径，先放入文件再改这里）：

  1. docs/images/read-mode.png
     阅读模式，打开一份含公式、表格、代码块的中文教材章节。要求：窗口 1440×900，
     浅色主题，大纲面板展开，公式显示为真实字形而非红字。
  2. docs/images/instant-mode.png
     即时渲染模式，某一个段落处于编辑态（该段落显示为源码文本框，其余段落保持渲染结果）。
  3. docs/images/diagnostics.png
     诊断面板，展示「未闭合围栏」或「公式渲染失败」条目，并高亮其行号与源码片段。
  4. docs/images/export.png
     「导出 HTML」完成后的提示条，以及导出的 .html 在离线状态下的打开效果。

  截图放入 docs/images/ 后再删除本注释并把上面的路径加进正文。
-->

（截图待补充，见上方占位说明。）

---

## 环境要求

下表版本来自 `SESSION_HANDOFF.md` §2，是本项目实际验证过的组合：

| 组件 | 版本 | 说明 |
|---|---|---|
| Node.js | 24.16.0 | `package.json` 的 `engines` 要求 `>=20.19` |
| pnpm | 11.5.0 | 本仓库使用 pnpm（有 `pnpm-lock.yaml` 与 `pnpm-workspace.yaml`） |
| Rust / cargo | 1.99.0 | **项目本地安装**，位于 `.tools/`，不修改系统环境 |
| MSVC 生成工具 | BuildTools 14.44.35207 | 链接与 `rc.exe` |
| Windows SDK | 10.0.26100 | 同上 |
| WebView2 运行时 | 149.0.4022.62 | 系统自带，应用的实际渲染引擎 |
| Tauri | CLI 2.12.3 / crate 2.12.4 | crate 声明 `rust-version = "1.90"` |
| MathJax | 4.1.3 | 加 `mathjax-newcm-font`、`mathjax-mhchem-font-extension` 两个字体包 |

其他运行时依赖（仅在使用时需要）：Git；若要跑 Playwright 需要本机安装 **Microsoft Edge**
（套件跑在 `msedge` 通道上，不下载 Chromium）。

---

## 引导（Bootstrap）

### 1. 安装前端依赖

```bash
pnpm install
```

仓库根目录的 `.npmrc` **必须保留**：它把 registry 固定为 `registry.npmjs.org`，覆盖用户级
`~/.npmrc` 里那个滞后于上游的镜像（该镜像缺少 `create-wdio@10.0.2`，会直接导致安装失败）。

`pnpm dev` / `pnpm build` 会通过 `predev` / `prebuild` 钩子自动执行
`node scripts/prepare-mathjax.mjs`，把 MathJax 4 与两个字体包复制进 `public/`。
`public/mathjax/` 与 `public/mathjax-fonts/` 是生成物，已被 gitignore，不要提交，也不要在
脚本里改目录名——MathJax 按 `<fonts>/<fontName>/svg.js` 拼字体 URL，改名会让化学式静默
退化成缺字形。

### 2. 安装项目本地 Rust 工具链

Rust **没有全局安装**，`cargo` 在这个 shell 里也无法作为裸命令解析（工作区路径含空格）。
请显式设置三个环境变量并使用绝对路径：

```bash
export RUSTUP_HOME="D:/OMP WorkSpace/REA typora/.tools/rustup"
export CARGO_HOME="D:/OMP WorkSpace/REA typora/.tools/cargo"
export CARGO_TARGET_DIR="D:/OMP WorkSpace/REA typora/.tools/target"

# 首次安装：从国内镜像下载 rustup-init，装进 .tools/
#   https://rsproxy.cn/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
#   以 --profile minimal --no-modify-path 运行，RUSTUP_HOME / CARGO_HOME 指向 .tools/ 下
#   直接从 static.rust-lang.org 安装在当前网络下不可行（实测约 5 KB/s）

# 校验
"D:/OMP WorkSpace/REA typora/.tools/cargo/bin/cargo.exe" -V
"D:/OMP WorkSpace/REA typora/.tools/cargo/bin/cargo.exe" check \
  --manifest-path "D:/OMP WorkSpace/REA typora/src-tauri/Cargo.toml"
```

Rust crate 通过 `.tools/cargo/config.toml` 里的 `sparse+https://rsproxy.cn/index/` 镜像拉取，
保留该配置。

`source scripts/env.sh` 存在，但它导出的 `PATH` 在当前 shell 中不会保持；请优先使用上面的
绝对路径。

### 3. 关于 `C:\omkth` 目录联接（junction）

Tauri CLI 需要在这个含空格的路径下找到项目本地工具链。为此曾创建一个机器级 junction
`C:\omkth` → `<repo>\.tools`。它**不是**日常构建所必需的；如需清理：

```bash
rmdir C:\omkth
```

### 4. 常用开发命令

```bash
pnpm dev                 # Vite 开发服务器（端口 1420）
pnpm typecheck           # TypeScript 类型检查
pnpm build               # 生产构建到 dist/（同时会补 vendor MathJax）
pnpm test                # Vitest：unit + dom 两个 project
pnpm test:e2e            # Playwright（需先 pnpm build）
pnpm desktop:dev         # tauri dev，跑真实桌面窗口
pnpm desktop:build       # tauri build：NSIS + MSI 安装包
```

当前 shell 无法解析带空格的 PATH 项，因此裸 `tsc` / `cargo` 会失败。等价的绝对调用：

```bash
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
node node_modules/@playwright/test/cli.js test
node node_modules/.bin/tauri.CMD build
```

---

## 命令表

以下内容对应 `package.json` 的 `scripts` 字段（逐条列出，无删减）。

| 命令 | 作用 |
|---|---|
| `pnpm predev` | `dev` 之前自动执行：把 MathJax 4 及字体复制进 `public/`（`node scripts/prepare-mathjax.mjs`） |
| `pnpm dev` | 启动 Vite 开发服务器（端口 1420，`strictPort`） |
| `pnpm prebuild` | `build` 之前自动执行：同一份 MathJax 复制 |
| `pnpm build` | Vite 生产构建，输出到 `dist/` |
| `pnpm preview` | 预览生产构建（端口 4173） |
| `pnpm typecheck` | `tsc --noEmit -p tsconfig.json`，覆盖 app、tests 与 scripts |
| `pnpm lint` | ESLint，`--max-warnings 0` |
| `pnpm format` | Prettier 写入 `src/**` 与 `tests/**` |
| `pnpm test` | Vitest 全量：`unit`（Node）与 `dom`（jsdom）两个 project |
| `pnpm test:watch` | Vitest 监听模式 |
| `pnpm test:unit` | 只跑 `unit` project（Node，无 DOM） |
| `pnpm test:coverage` | 带 v8 覆盖率；`src/core/**`、`src/app/**` |
| `pnpm test:e2e` | Playwright，跑在已构建的生产包上，Edge 通道 |
| `pnpm test:e2e:update` | 更新 Playwright 截图基线（开发者主动行为） |
| `pnpm test:desktop` | 经 `scripts/run-desktop-e2e.mjs` 启动 WebdriverIO，驱动**真实 Windows 二进制**（该包装脚本把项目本地 Rust 工具链放进子进程 PATH） |
| `pnpm typecheck:desktop` | 用 `tsconfig.desktop.json` 检查 `tests/desktop` 的类型（WebdriverIO 的全局类型不属于应用的类型环境，因此单独一份配置） |
| `pnpm desktop:dev` | Tauri 开发模式（热重载的桌面窗口） |
| `pnpm desktop:build` | 构建发布版 Windows 安装包（NSIS + MSI）；经 `scripts/build-release.mjs` 把项目本地 Rust 工具链放进子进程环境 |
| `pnpm desktop:build:portable` | 构建便携版并自动打包为 zip（Tauri 没有便携目标，包由构建脚本组装） |
| `pnpm perf` | 解析性能基准，输出到压力语料上（见 `docs/TEST_REPORT.md` §5） |
| `pnpm verify` | `typecheck` + `lint` + `test` 的组合，提交前跑这个 |
| `pnpm corpus:verify` | 校验 `tests/corpus/manifest.json` 与磁盘文件一致 |
| `pnpm tauri` | 透传 Tauri CLI（`pnpm tauri <子命令>`） |
| `pnpm desktop:dev` | `tauri dev`，开发态桌面窗口 |
| `pnpm desktop:build` | `tauri build`，产出 NSIS 安装包与 MSI（目标 `nsis`/`msi`/`app`） |
| `pnpm desktop:build:portable` | `tauri build --no-bundle -c src-tauri/tauri.portable.conf.json`，再打包成便携 zip：可执行文件把配置与 WebView2 数据写在自身同目录的 `data/` 下 |
| `pnpm verify` | `typecheck && lint && test` 串行 |

---

## 项目结构

以下目录树读自实际仓库（已略去 `.git/`、`node_modules/`、`.tools/`、`dist/`、
`src-tauri/target/`、`test-results/`、`playwright-report/` 与 `public/mathjax*/` 下的
生成文件）：

```
.
├─ index.html                    应用外壳：CSP、#root、加载 /src/main.tsx
├─ package.json / pnpm-lock.yaml
├─ vite.config.ts                Vite 8：@ → src 别名、端口 1420、target chrome130
├─ vitest.config.ts              unit(node) + dom(jsdom) 两个 project
├─ playwright.config.ts          Edge 通道，testDir=tests/e2e，webServer=vite preview
├─ tsconfig.json / tsconfig.desktop.json
├─ src/
│  ├─ main.tsx                   入口；仅在测试桩被显式注入时暴露自动化接口
│  ├─ App.tsx                    窗口级职责：快捷键、拖放、外部改动轮询、自动保存
│  ├─ app/
│  │  ├─ store.ts                zustand store；唯一的写盘入口
│  │  ├─ settings.ts             设置默认值、持久化、CSS 变量投影
│  │  └─ session.ts              最近文件与阅读位置
│  ├─ components/
│  │  ├─ Toolbar.tsx  Sidebar.tsx  StatusBar.tsx
│  │  ├─ DocumentView.tsx        阅读视图（一次性注入 HTML）
│  │  ├─ InstantView.tsx         即时渲染，按块就地编辑
│  │  ├─ SourceEditor.tsx        CodeMirror 6 源码编辑器
│  │  ├─ OutlinePanel.tsx  SearchPanel.tsx  DiagnosticsPanel.tsx
│  │  ├─ SettingsPanel.tsx  RecentPanel.tsx  MathTools.tsx
│  │  └─ useTypesetting.ts       懒排版与阅读进度/位置
│  ├─ core/
│  │  ├─ markdown/               engine.ts, math-plugin.ts, math-source.ts, rules.ts,
│  │  │                          line-index.ts, collector.ts, placeholders.ts, sanitize.ts, types.ts
│  │  ├─ math/mathjax.ts         仅浏览器运行的 MathJax 4 驱动
│  │  ├─ render/                 typesetter.ts, mermaid.ts, highlighter.ts
│  │  ├─ diagnostics/assets.ts   图片引用健康检查
│  │  ├─ export/                 html.ts, pdf.ts, assets.ts, code.ts, styles.ts, ipc.ts, types.ts
│  │  ├─ fs/                     encoding.ts, fileService.ts
│  │  └─ util/guards.ts
│  ├─ i18n/index.ts              中英文字符串（中文为主语言）
│  ├─ styles/                    tokens.css, app.css, document.css
│  └─ types/                     环境声明（automation.d.ts、markdown-it-plugins.d.ts）
├─ src-tauri/
│  ├─ Cargo.toml / Cargo.lock
│  ├─ tauri.conf.json            窗口、CSP、bundle、fileAssociations
│  ├─ tauri.portable.conf.json   便携配置（appDirectoriesOverride: "data"）
│  ├─ capabilities/default.json  权限范围
│  ├─ icons/
│  └─ src/
│     ├─ main.rs                 薄启动器
│     ├─ lib.rs                 窗口、插件、单实例、argv 处理、IPC 注册
│     ├─ commands.rs             文件读写、stat、list_dir、资产路径解析
│     └─ export.rs               读取图片为 base64、WebView2 PrintToPdf
├─ public/
│  ├─ favicon.svg
│  ├─ mathjax/v4/                由 prepare-mathjax.mjs 生成（gitignore）
│  └─ mathjax-fonts/             同上
├─ scripts/
│  ├─ prepare-mathjax.mjs        vendor MathJax 4 与字体
│  ├─ env.sh                     项目本地工具链环境变量
│  ├─ verify-corpus.mjs          语料校验器
│  ├─ gen-corpus-stress.mjs      确定性压力语料生成器
│  ├─ perf-parse.mjs             解析性能测量脚本（`pnpm perf` = `node --expose-gc scripts/perf-parse.mjs`）
│  ├─ run-desktop-e2e.mjs        `pnpm test:desktop` 的包装脚本（注入工具链 PATH）
│  ├─ lib/corpus-scan.mjs        expect 计数规则的唯一实现
│  ├─ generate-icon.mjs  probe-fixture.mjs  probe-page.mjs
├─ tests/
│  ├─ corpus/                    148 份 markdown 文档、355 个公式用例（其中 40 个预期报错）、
│  │                             manifest.json、assets/、stress/（生成，gitignore）
│  ├─ unit/                      encoding、roundtrip、markdown-blocks、math-source、corpus
│  │  └─ dom/                    DOMPurify 边界
│  ├─ e2e/                       rendering.spec.ts（Playwright）
│  ├─ desktop/                   openmark.spec.ts + wdio.conf.ts（WebdriverIO + 真机二进制）
│  └─ perf/                      空目录（性能测量目前只在 scripts/perf-parse.mjs 里）
└─ docs/                         PRD、ARCHITECTURE、FEATURE_MATRIX、TEST_STRATEGY、RESEARCH、
                                  USER_GUIDE、KNOWN_ISSUES
```

---

## 测试：怎么跑，能证明什么

```bash
node node_modules/vitest/vitest.mjs run        # 或 pnpm test
node node_modules/@playwright/test/cli.js test # 或 pnpm test:e2e（需先 pnpm build）
node scripts/verify-corpus.mjs                 # 或 pnpm corpus:verify
pnpm test:desktop                              # WebdriverIO，见下方说明
```

每一层各回答一个别层回答不了的问题：

| 层 | 入口 | 能证明什么 |
|---|---|---|
| 单元（Vitest，Node，无 DOM） | `pnpm test:unit` | 解析流水线（`src/core/markdown/**`）、编码模块、数学分词器、诊断与设置的纯逻辑。断言的是**分词**（分隔符类型、`tex` 正文、逐字节的 `raw`、行列偏移），不是渲染。 |
| DOM（Vitest，jsdom） | `pnpm test`（`dom` project） | DOMPurify 清洗边界。这是安全边界，因此直接测，而不是只靠浏览器套件间接覆盖。 |
| 往返保真（Vitest + fast-check） | `pnpm test`（`tests/unit/roundtrip.test.ts`） | 「打开→保存」不改变字节：对全部 148 份语料在 LF/CRLF/CR/BOM 组合下断言 `decode→encode→decode` 逐字节一致，并断言单字符插入只改一个字。 |
| 浏览器渲染（Playwright） | `pnpm test:e2e` | 真实 DOM 与真实 MathJax/Mermaid/Shiki：**离线**渲染、公式产生真实字形、失败公式保留源码、XSS 被中和、即时渲染按块编辑、CRLF 文件编辑后仍是 CRLF、导出产物自包含。这一层是唯一能诚实宣称公式「渲染出来了」的地方（断言的是 MathJax 自己的错误报告与字形元素，不是 DOM 里有没有节点）。 |
| 桌面端 E2E（WebdriverIO） | `pnpm test:desktop` | 真实 Windows 二进制：启动外壳、通过 `openmark://open-file` 打开文档、切到源码模式、公式排版，以及**外部修改探测在无人改动的文件上保持沉默**。8 个用例全绿，跑在发布版二进制上。 |
| 语料校验 | `pnpm corpus:verify` | 清单与磁盘一致：文件齐全、UTF-8/LF/单个结尾换行、`expect` 计数与内容吻合、数学用例分片完整、语言配比达标。 |
| 解析性能（非测试层） | `pnpm perf` | 只测流水线的同步部分（打开文档、每次按键都要跑的那段）：对 5 个压力语料计时。**没有**门限断言、也**不测**排版与布局，因此预算尚未被固定为回归。 |

`tests/corpus/` 的规模（`node scripts/verify-corpus.mjs` 实测）：148 份 markdown 文档、
355 个公式用例（40 个预期报错）、5 个生成的压力文件。

关于 MathJax 为什么不在 Vitest 里：MathJax 4 的 Node 组件加载器会把 `D:/…` 这样的裸
Windows 路径交给 `import()`，而 `import()` 需要 `file://` URL，因此它在本平台的 Node 下
根本无法启动。渲染一律由 Playwright 验证。

---

## 已知限制

尚未实现、部分实现或存在已知缺陷的功能，集中记录在
[`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md)（按 P0–P3 分级，附复现步骤与规避方法）。
面向使用者的操作说明见 [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)。

---

## 许可

本仓库的代码以 MIT 许可发布（`package.json` 与 `src-tauri/Cargo.toml` 均为 `MIT`）。

第三方组件及其许可证清单见 [`docs/LICENSE_NOTICES.md`](docs/LICENSE_NOTICES.md)，由依赖许可证审计流程生成。
许可证事实也可直接从 `package.json` 的 `dependencies` / `devDependencies` 与 `src-tauri/Cargo.toml` 追溯。

需要特别注意的是：`public/mathjax/`、`public/mathjax-fonts/` 下的 MathJax 4 与其字体数据
（`@mathjax/mathjax-newcm-font`、`@mathjax/mathjax-mhchem-font-extension`）随应用一起分发，
其各自的许可证随文件保留（`public/mathjax/v4/LICENSE`）。Mermaid、Shiki、CodeMirror、
DOMPurify、markdown-it 及其插件通过 `package.json` 依赖引入。

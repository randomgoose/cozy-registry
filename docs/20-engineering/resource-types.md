# 资源类型：样式、图标、组件、Block 的管理与发布

> 讨论四类资源分别适合以什么形式管理和发布，便于后续扩展 schema 与 API。

---

## 一、总览

| 资源类型 | 形态建议 | 存储形式 | 发布/消费方式 | 说明 |
|----------|----------|----------|----------------|------|
| **样式** | 配置优先 | JSON / 单条记录 | 按「主题」发布，整体拉取 | 轻量、全局，组件/block 依赖它 |
| **图标** | 集合 + 单文件 | 多文件或 SVG sprite | 按集合发布，按名引用 | 数量多、命名稳定，适合包或 registry 条目 |
| **组件** | 单组件为单位（可多文件） | 当前 item + `files[]` | 按「个」发布，Copy 进项目 | 保持 registry:ui；组件库场景更强调依赖化 |
| **Block** | 场景块（通常多文件 bundle） | 当前 item + `files[]` | 按「个」发布，Copy 进项目 | 保持 registry:block；允许自包含与重复 |

> 延伸规范：Block vs 组件库（Library）的发布/依赖解析/覆盖策略，见 `docs/30-rules/namespace-library-and-block-spec.md`。

---

## 二、样式 (Styles)

**适合的管理形式**

- **按「主题」管理**：一个主题 = 一套 token（颜色、字体、间距、圆角等），对应一份配置。
- **不按「单个 token」发布**：避免海量细粒度条目，难以版本和依赖管理。

**适合的存储与发布形式**

- **存储**：  
  - 方案 A：独立表 `registry_themes`，一条记录 = 一个主题，内容存 JSON（或 `registry_files` 里 path 如 `themes/default.json`）。  
  - 方案 B：沿用 `registry_items`，`type = "registry:theme"`，单 file 存 JSON；与组件/block 共用列表与权限。
- **发布**：  
  - 以「主题」为粒度发布，例如 `theme-default`、`theme-dark`。  
  - 输出：一份 JSON（或生成 CSS 变量 + 一份小 JSON），供 shadcn/项目引用。

**消费方式**

- 项目侧：一次拉取一个主题（或选几个），写入 `globals.css` / tailwind 配置 / Design Tokens。  
- 组件/block：在描述或 `registryDependencies` 里声明依赖某主题（如 `@team/theme-default`），AI 与工具可据此先拉样式再拉组件。

**建议**

- 先支持「主题级」发布即可；单 token 可放在主题 JSON 里，不必单独做资源类型。  
- 若希望和组件统一体验，用 `type = "registry:theme"` + 单文件 JSON 即可，无需立刻拆新表。

---

## 三、图标 (Icons)

**适合的管理形式**

- **按「集合」管理**：一个集合 = 一套图标（如「团队 UI 图标集」「活动页图标」），集合内按 name 引用。
- **单图标不作为独立「可发布条目」**：避免成千上万条 registry 条目，列表与 MCP 都难用。

**适合的存储与发布形式**

- **存储**：  
  - 方案 A：一个 registry 条目 = 一个图标集合，`type = "registry:icon-set"`，`registry_files` 里多行：每行一个 `path`（如 `icons/arrow-right.svg`）+ `content`（SVG 源码或 React 组件源码）。  
  - 方案 B：图标集合打成一个「单文件」（如一 React 文件里 export 多个 Icon 组件），则退化为「一个 item + 一个 file」，和组件类似，但语义是 icon-set。
- **发布**：  
  - 以「集合」为粒度发布，例如 `icons-ui`、`icons-marketing`。  
  - 输出：  
    - 要么多个 SVG/TSX 文件（对应多 path），  
    - 要么一个入口文件 + 若干 SVG/TSX（由工具生成或上传时打包）。

**消费方式**

- 项目：按集合拉取，在代码里 `import { IconArrow } from "@team/icons-ui"` 或从 registry 复制对应文件。  
- AI/MCP：`get_component` 可返回「图标集合」类型，或单独提供 `list_icons` / `get_icon_set`，按 name 返回单个图标或整集。

**建议**

- 第一版可把「图标集合」做成一种特殊组件：一个 item 对应一个「导出多个 Icon 的 TSX 文件」或「多文件 zip/多 registry_files」。  
- 若集合内图标很多，更推荐「多文件」存 `registry_files`，path 如 `icons/name.svg`，便于按名检索和按需拉取。

---

## 四、组件 (Component)

**当前形态（建议保持）**

- **管理**：按「个」管理，每个组件一条 `registry_items`，`type = "registry:ui"`。  
- **存储**：默认可为单文件 TSX；当存在相对路径引用（`./`/`../`）或需要拆分时，允许作为**单 item 多文件 bundle** 存在 `registry_files`（对外输出为 `files[]`）。  
- **发布**：一个 name 一个条目，支持 public/private、owner、依赖（dependencies / registryDependencies）。  
- **消费**：Copy 进项目、`shadcn add`、MCP `get_component` 等。

**判定准则（语义优先、形态其次）**

- `registry:ui` 与 `registry:block` 的区别主要在**语义与治理规则**，而不是“单文件 vs 多文件 bundle”：
  - **Component**：基础复用单元，更倾向**依赖化**（`registryDependencies`）、统一命名与版本治理、以及（可选的）canonical 输出路径约束。
  - **Block**：场景化模块，更强调“可预览/可复制/自包含”，允许重复实现与自由组织文件。

**适合的原因**

- 组件粒度清晰、命名稳定，按「个」发布和检索符合心智；单文件 TSX 与「Copy, don’t install」一致，也便于 AI 理解与引用。

**可选增强**

- 若未来支持多 variant（如 Button 的 primary/ghost），可在一个 item 下多 file（如 `button.tsx` + `button-variants.tsx`），或仍保持单文件、在 meta 里描述 variants。

---

## 五、Block（模块）

**当前形态（建议保持）**

- **管理**：按「个」管理，每条 `registry_items`，`type = "registry:block"`。  
- **存储**：允许（且推荐）作为**单 item 多文件 bundle**：相对路径引用的源码必须随 bundle 一起提交；bare import 走 `dependencies` / `registryDependencies`。  
- **发布 / 消费**：与组件相同流程，仅 type 和展示分类不同。

**判定准则（语义优先、形态其次）**

- 当一个条目主要用于“沉淀可复用的基础能力（Button/Dialog 等）”，并希望被其它条目作为依赖复用时，优先建模为 **`registry:ui`**。
- 当一个条目主要用于“快速表达一个页面片段/业务场景（Hero/Pricing 等）”，并以自包含可预览为首要目标时，优先建模为 **`registry:block`**。

**适合的原因**

- Block 是「大块 UI 模块」，仍然以「一个名字 = 一个可复用块」为单位；既可以是单文件 TSX，也常见为多文件 bundle（当存在相对路径拆分/局部样式等）；依赖通过 `registryDependencies` 声明即可（如依赖某 Button、某 theme）。

**与组件的区别**

- 仅在语义和展示上区分：Block 偏向 Landing/活动页的整块（Hero、Pricing、Testimonial），Component 偏向基础 UI（Button、Card）；底层存储和发布形式可以一致。

---

## 六、类型扩展与实现顺序建议

1. **保持兼容**：`registry:ui`、`registry:block` 继续“一个 item 对外输出一个条目”的方式；存储上从“单文件”演进到“允许多文件 bundle”，并保持向后兼容。旧数据中的 `registry:component` 作为 legacy alias 读取并逐步迁移到 `registry:ui`。  
2. **样式**：新增 `registry:theme`（或独立 themes 表），单条目单文件 JSON，按主题发布；API 增加「按主题拉取」或 `get_styles`。  
3. **图标**：新增 `registry:icon-set`，一个条目对应多 `registry_files`（每图标一个 path + content），按集合发布；MCP 可增加 `list_icons` / `get_icon_set`。  
4. **依赖关系**：组件/block 的 `registryDependencies` 可引用 theme / icon-set（如 `@team/theme-default`、`@team/icons-ui`），便于 AI 和工具按顺序拉取。

这样「样式、图标、组件、block」四类资源都有明确的管理与发布形式，且与当前实现路径兼容。

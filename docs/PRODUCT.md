# 产品文档：设计师参与的组件分发工具

> 一个让设计师更好参与 Vibe Coding 的工具，支持设计师创建和发布组件，并让 AI 更好地使用这些组件。

---

## 一、产品愿景

### 1.1 核心定位

**做一个「设计侧可参与的组件分发中心」，让设计资产能稳定进入开发流程和 AI 流程。**

### 1.2 部署模式（战略选择）

**主方向：企业/组织自部署 Registry**

- 团队可快速建立和共享样式、组件、模块
- 支持 Vibe Coding 项目快速落地
- 数据与资产留在组织内部，可控、可定制

**不作为主方向：公开大众 Registry + 盈利**

- 21st.dev 等已占据组件市场
- 本产品差异化在「工作流」而非「交易」
- 可选：提供公开示例/模板库作为附加能力，或允许团队选择性公开展示

### 1.3 与现有工具的差异化

| 工具类型 | 代表产品 | 局限 | 本产品的方向 |
|----------|----------|------|--------------|
| 完整站点生成 | Figma Make、Lovable | 产出完整 demo，但企业内开发往往不让设计师碰生产代码；设计师缺乏组件管理和分发工具 | **不做整站**，专注组件分发，融入现有工作流 |
| 组件/设计系统工具 | Storybook、Zeroheight | 多为开发维护，设计师参与度低 | 设计师可发布、管理、参与创建 |
| 包管理 | npm、内部包仓库 | 纯开发视角，设计师几乎无法参与 | 增加设计侧工作流和元数据 |

---

## 二、目标场景：Landing / 活动页

### 2.1 服务对象

**不是**：成熟设计系统团队（已有完整组件库和流程）  
**而是**：Landing page、活动页、营销页等更轻量的场景

### 2.2 场景特点

- 节奏快，需要快速出稿、快速上线
- 以展示为主：Hero、Feature、Testimonial、CTA、Gallery 等
- 设计师主导视觉和结构
- 不要求完整设计系统，只需「这一页/这一波活动」的样式和模块一致

### 2.3 典型流程

1. 设计师接到需求：「做一个产品发布活动的 Landing 页」
2. 用 Vibe Coding 产出：Hero、Feature 卡片、CTA、Footer 等模块
3. 定义该页的样式（主色、字体等）
4. 发布到 Registry，按项目/活动分组
5. 开发拿到模块，接入真实文案、链接、埋点
6. 下次类似活动，可直接复用或微调

---

## 三、Registry 形态：样式 + 基础组件 + 常用模块

### 3.1 参考：shadcn registry

- Copy, don't install：代码进项目，可自由修改
- 清晰分类、统一结构、文档化
- AI 因结构清晰而易于理解

### 3.2 本产品的三层结构

| 层级 | 示例 | 说明 |
|------|------|------|
| **样式** | 颜色、字体、间距、圆角 | 轻量配置，供组件/模块继承 |
| **基础组件** | Button、Card、Badge、Input | 设计师 Vibe Coding 产出 |
| **常用模块** | Hero、Feature Grid、Pricing、Testimonial | 展示类组合块，shadcn 不做 |

### 3.3 目录结构草图

```
/registry
  /styles          # 样式配置
    /theme-default.json
    /theme-dark.json
  /components      # 基础组件
    /button/
    /card/
    /badge/
  /modules         # 常用模块
    /hero/
    /feature-grid/
    /pricing-section/
    /testimonial/
```

### 3.4 产品形态：独立 Web 应用

- **独立部署**：单独 Web 应用，不嵌入现有项目
- **类似 Figma Make 社区，但对内**：浏览、发现、复用的社区体验，组织内部使用
- **CLI 非重点**：大部分 Vibe Coding 设计师不熟悉命令行，以 Web 操作为主
- **标准格式输出**：发布形式让不同工具（Figma Make、Lovable、shadcn、jsrepo）快速接入，类似 reactbits

### 3.5 格式与消费流程：shadcn registry + jsrepo

**格式**：采用 shadcn registry schema（`registry.json`、`registry-item.json`），保证生态兼容

**流程**：借鉴 jsrepo，避免 shadcn init 的繁琐
- shadcn init 强制选择 style 预设（New York / Default），与自有 registry 样式冲突
- 本产品：**样式由 registry 提供**，作为「第一来源」
- 简化「首次使用」：不要求 `shadcn init`，registry 提供零预设的 base 样式
- 已用 shadcn 的项目可继续用 `shadcn add` 从本 registry 拉取

**两层结构**：
- **Web 应用（人用）**：浏览、搜索、预览、发布、管理
- **Registry API（机器用）**：标准 schema，供工具消费

### 3.6 目标：AI 友好

- 结构化元数据（名称、描述、适用场景、Props、标签）
- 统一 schema，便于 AI 解析和检索
- 语义化描述（如「主 CTA 按钮，适合 Landing 页」）
- 可与 Cursor Rules、RAG 等集成
- *（详见「AI 友好」章节）*

---

## 四、设计师参与：具体定义

### 4.1 核心方式

**设计师通过 Vibe Coding 的形式产出组件。**

产出物可以是：
- **纯样式组件**：仅视觉呈现
- **带模拟功能的组件**：有交互反馈，但数据和行为为 mock

### 4.2 创建入口（多方式支持）

| 方式 | 说明 | 优先级 |
|------|------|--------|
| **内置 Vibe Coding** | 在工具内直接创建、预览，对话式产出 | 主入口 |
| **粘贴 TSX** | 从外部复制组件代码，粘贴到发布界面 | 支持 |
| **Figma MCP** | 通过 Figma MCP 导入设计稿 | 支持 |
| **Figma Make 插件** | 若 Make 支持插件，可从 Make 上传 | 可选 |

**基本检查**：无论何种方式创建，必须通过基本检查，确保组件可正常预览和运行。

### 4.3 分工边界

| 设计师负责 | 开发负责 |
|-----------|----------|
| 视觉样式、基础交互反馈、布局结构 | 真实数据、API、业务逻辑 |
| 模拟数据、模拟行为、Props 接口定义 | 传入真实实现 |

**关键价值**：开发只需补功能，不需要管组件样式。

### 4.4 边界原则

- 设计师负责「如果长这样，该怎么画」
- 开发负责「什么时候该画、画什么数据」

---

## 五、数据存储

**采用数据库，而非纯 JSON 文件。**

| 选择 | 说明 |
|------|------|
| **技术栈** | Drizzle ORM + PostgreSQL |
| **数据库** | 存储组件、模块、样式、元数据，便于管理、查询、版本控制 |
| **动态生成 shadcn JSON** | 从数据库读取数据，按需生成符合 shadcn registry schema 的 `registry.json` 及 `/r/[name].json`，供工具消费 |
| **不依赖 JSON 文件** | 纯 JSON 文件管理成本高，难以应对多用户、权限、审计等需求 |

---

## 六、系统架构（规划）

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  设计师工作流     │ ──► │  组件注册中心      │ ◄── │  AI 使用层       │
│  (Vibe Coding   │     │  数据库 + 动态     │     │  MCP / 发现 /    │
│  粘贴/Figma等)  │     │  生成 shadcn JSON │     │  引用            │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 七、MVP 路线图

**开发顺序：从 AI 使用开始，再做创建与上传。**

### Phase 1：AI 使用验证（先做）

1. **预设组件**：Hero Section、FAQ、Pricing Card（三个简单模块），seed 写入数据库
2. 实现 Registry API：动态生成 shadcn 格式的 `registry.json`、`/r/[name].json`
3. 实现 MCP：`list_components`、`get_component`，接入 Cursor
4. 验证：AI 能正确查询并使用这些预设组件

### Phase 2：组件创建与上传

1. 发布界面：粘贴 TSX、填写元数据、预览
2. 基本检查：确保组件可正常预览和运行
3. 内置 Vibe Coding 创建界面（可选，或与粘贴并行）
4. Figma MCP、Figma Make 插件等（按需）

### Phase 3：增强与规模化

1. 组件/模块浏览与搜索
2. MCP 扩展：`search_components`、`get_styles`
3. 多项目、多团队、版本管理
4. 与 Design Tokens 等打通

---

## 八、AI 友好

### 8.1 目标

让 AI（如 Cursor、Copilot）在 Vibe Coding 时能发现、理解、正确使用 registry 中的组件。

### 8.2 方案选择：优先 MCP

**采用 MCP（Model Context Protocol）作为 AI 集成方式。**

| 优势 | 说明 |
|------|------|
| 按需获取 | AI 需要时再查询，不占满上下文 |
| 生态通用 | Cursor、Claude Desktop 等 MCP 客户端均可使用 |
| 可扩展 | 后续可增加工具，不改协议 |
| 与自部署匹配 | 企业自部署 registry 时，MCP 指向其 registry URL |

### 8.3 MCP 工具设计（草案）

| 工具 | 用途 | 示例 |
|------|------|------|
| `search_components` | 按语义/关键词搜索 | "landing hero" → 返回 Hero 相关组件 |
| `get_component` | 获取组件完整信息（含代码） | 返回 props、示例、源码 |
| `list_components` | 列出组件（可按类型/标签过滤） | 列出所有 modules 或 styles |
| `get_styles` | 获取样式配置 | 主题的 CSS 变量、Tailwind 配置 |

### 8.4 架构

```
数据库（组件/模块/样式）
       │
       │ 动态生成 shadcn 格式
       ▼
Registry API（/api/registry.json, /api/r/[name].json）
       │
       ▼
MCP Server（可独立部署或内嵌）
       │
       │ 读取 registry 数据，暴露 MCP tools
       │
       ▼
Cursor / 其他 MCP 客户端
       │
       │ 用户说「加一个 Hero」→ AI 调用 search_components → get_component
       │
       ▼
生成代码时使用 registry 中的组件
```

### 8.5 验证计划

1. **最小 MCP 原型**：实现 `list_components`、`get_component`，用 mock 或少量真实数据
2. **在 Cursor 配置**：将 MCP server 接入 Cursor，验证 AI 能否正确调用
3. **典型场景测试**：如「加一个 Landing Hero」「用 registry 的 Button」
4. **迭代**：根据效果决定是否增加 `search_components`、RAG 等

### 8.6 其他方向（备选）

- **Cursor Rules**：组件少时可用，简单但扩展性有限
- **RAG 检索**：组件多时考虑，需 embedding 与向量库
- **元数据**：在 shadcn schema 基础上，可增加 `useWhen`、`tags` 等 AI 专用字段

---

## 九、实现状态（Phase 1）

- [x] Drizzle + Postgres schema
- [x] 预设组件 seed（Hero Section、FAQ、Pricing Card）
- [x] Registry API（/api/registry、/api/r/[name]）
- [x] MCP server（list_components、get_component）
- [x] Cursor MCP 配置（.cursor/mcp.json）

### 9.1 待讨论事项

- [ ] 组件/模块 schema 的详细设计
- [ ] 「Add to project」方式（Web 复制 / CLI 拉取）
- [ ] 样式与组件/模块的关联机制

---

## 十、文档历史


| 日期 | 更新内容 |
|------|----------|
| 2025-03-14 | 初版创建，整合产品愿景、战略选择、MVP 场景、Registry 形态、设计师参与、部署模式 |
| 2025-03-14 | 补充产品形态（独立 Web、对内社区）、shadcn+jsrepo 格式与流程、AI 友好章节占位 |
| 2025-03-14 | AI 友好：确定 MCP 方案，补充工具设计、架构、验证计划 |
| 2025-03-14 | 设计师创建入口（内置 Vibe Coding + 粘贴 + Figma MCP + Make 插件）、数据存储（数据库 + 动态生成 shadcn JSON）、MVP 顺序（从 AI 使用开始） |
| 2025-03-14 | Phase 1 预设组件（Hero Section、FAQ、Pricing Card）、数据库选型（Drizzle + Postgres） |
| 2025-03-14 | Phase 1 实现完成：Drizzle schema、seed、Registry API、MCP server、Cursor 配置 |

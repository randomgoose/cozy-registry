# 产品文档：面向 Web 开发的 AI-native Registry

> 一个让设计师直接参与 AI 辅助 Web 开发流程的 registry，支持在 Vibe coding 工具中创建、迭代并分发 blocks、components 和 themes。

---

## 一、产品愿景

### 1.1 核心定位

**做一个「面向 Web 开发的 AI-native registry」，让设计师产出的前端资产能稳定进入开发流程和 AI 流程。**

进一步补充这层定位：

- Cozy Registry 不只是一个组件目录、预览站或发布界面
- 它更像一个 **面向 Web 前端资产的共享资产层**
- 这层资产既服务工程，也服务设计、AI agent，以及未来来自多种工具的入口
- 长期看，产品会逐步形成一个 **design system context layer / component operating layer**

进一步约束：

- **核心用户**是具备 Vibe coding 能力和意愿的设计师，以及负责消费这些资产的 AI agent
- **第一优先级资产**是 `registry:block`
- **最小闭环**不是“可发布可引用”，而是“可安装可升级”

### 1.2 部署模式（战略选择）

**主方向：企业/组织自部署 Cozy Registry**

- 团队可快速建立和共享样式、组件、模块
- 支持设计师通过 Vibe coding 工具直接参与 Web 项目落地
- 数据与资产留在组织内部，可控、可定制

**不作为主方向：公开大众 Registry + 盈利**

- 21st.dev 等已占据组件市场
- 本产品差异化在「工作流」而非「交易」
- 可选：提供公开示例/模板库作为附加能力，或允许团队选择性公开展示

### 1.3 与现有工具的差异化

| 工具类型 | 代表产品 | 局限 | 本产品的方向 |
|----------|----------|------|--------------|
| 完整站点生成 | Figma Make、Lovable | 擅长快速生成 demo，但缺少团队级资产沉淀、版本、分发与复用机制 | **不做整站工具**，承接其产出的 Web 资产并进入真实开发流程 |
| 组件/设计系统工具 | Storybook、Zeroheight | 偏向开发维护和展示，设计师直接产出与迭代能力弱 | 让设计师可直接创建、发布、迭代 block / component / theme |
| 包管理 / monorepo | npm、内部包仓库、monorepo design system | 工程治理强，但默认以代码仓库为中心，对设计师、AI agent 和跨工具工作流不够友好 | 不替代代码仓库，而是在其之上提供共享资产、上下文、preview、relationship 和 lifecycle 能力 |

---

## 二、目标场景：Web 前端资产，而非通用仓库

### 2.1 服务对象

**核心对象**：需要让设计师直接参与 Web 前端资产生产、安装与迭代的团队  
**不是**：单纯想找一个“更通用的组件仓库”替代 Storybook / npm 私库的团队

当前优先场景：

- Landing page、活动页、营销页、产品介绍页
- Feature section、内容模块、实验性视觉区块
- 轻量组件库和主题化组件包

### 2.2 场景特点

- 节奏快，需要快速出稿、快速上线
- 设计师主导视觉、结构和交互表达
- AI 工具参与创建与迭代，但需要可沉淀、可分发、可安装、可升级的资产出口
- 第一波最重要的是场景型 block，不只是一页的临时模块，而是可持续迭代的 bundle
- 复用型 component 很重要，但会在 block 体系稳定后逐步沉淀

### 2.3 典型流程

1. 设计师接到需求：「做一个产品发布活动的 Landing 页」
2. 在 Figma Make 等 Vibe coding 工具中产出：Hero、Feature 卡片、CTA、Footer，或更底层的 Button、Card、Theme
3. 设计师直接在工具中迭代这些资产，直到达到可消费状态
4. 发布到 Registry，按项目、活动或组件库分组
5. AI 或开发将 block 安装到项目中，并记录版本来源
6. 后续设计迭代时，AI 或开发可以比较版本、升级、替换或回滚

---

## 三、Registry 形态：Theme + Component + Block

### 3.1 参考：shadcn registry

- Copy, don't install：代码进项目，可自由修改
- 清晰分类、统一结构、文档化
- AI 因结构清晰而易于理解

### 3.2 本产品的三层结构

| 层级 | 示例 | 说明 |
|------|------|------|
| **Theme** | 颜色、字体、间距、圆角、tokens | 作为风格和设计语言的第一来源 |
| **Component** | Button、Card、Badge、Input、Tabs | 可复用组件和组件库条目，后续逐步沉淀 |
| **Block** | Hero、Feature Grid、Pricing、带 WebGL 特效的 section | 第一优先级资产，场景块、页面模块和实验性区块，允许 bundle 化 |

### 3.3 当前优先级

1. `registry:block`
2. `registry:theme`
3. `registry:ui`

原因：

- block 最符合设计师在 Vibe coding 工具中的真实产出形态
- block 往往需要 bundle，包含本地引用、样式、辅助文件和特效实现
- component 会很重要，但更适合在 block 生态稳定后逐步抽取和规范化

### 3.4 目录结构草图

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

### 3.5 产品形态：独立 Web 应用

- **独立部署**：单独 Web 应用，不嵌入现有项目
- **承接 Vibe coding 资产**：浏览、发现、复用由 Web、Figma Make、MCP 等入口产出的前端资产
- **CLI 非重点**：大部分 Vibe Coding 设计师不熟悉命令行，以 Web 操作为主
- **标准格式输出**：发布形式让不同工具（Figma Make、Lovable、shadcn、jsrepo）快速接入，类似 reactbits

### 3.6 格式与消费流程：shadcn registry + jsrepo

**格式**：采用 shadcn registry schema（`registry.json`、`registry-item.json`），保证生态兼容

**流程**：借鉴 jsrepo，避免 shadcn init 的繁琐
- shadcn init 强制选择 style 预设（New York / Default），与自有 Cozy registry 样式冲突
- 本产品：**样式由 Cozy registry 提供**，作为「第一来源」
- 简化「首次使用」：不要求 `shadcn init`，Cozy registry 提供零预设的 base 样式
- 已用 shadcn 的项目可继续用 `shadcn add` 从 Cozy registry 拉取

**两层结构**：
- **Web 应用（人用）**：浏览、搜索、预览、发布、管理
- **Registry API（机器用）**：标准 schema，供工具消费

进一步说，这两层共同服务的是：

- **共享资产层**：theme / component / block / collection / project 等资产本身
- **上下文层**：project、theme layers、preview、artifact、version、relationship

也就是说，本产品要解决的不只是“把代码放在哪里”，而是“这些前端资产如何被跨角色、跨工具一致地理解和消费”。

### 3.7 目标：AI 友好

- 结构化元数据（名称、描述、适用场景、Props、标签）
- 统一 schema，便于 AI 解析和检索
- 语义化描述（如「主 CTA 按钮」「带 WebGL 特效的 Hero section」）
- 可与 Cursor Rules、RAG 等集成
- *（详见「AI 友好」章节）*

---

## 四、设计师参与：具体定义

### 4.1 核心方式

**设计师通过 Vibe Coding 的形式产出 Web 前端资产。**

产出物可以是：
- **Theme**：颜色、字体、间距、圆角、设计 tokens
- **Component**：可复用的基础组件和组件库条目
- **Block**：第一优先级资产，场景化区块、模块、带视觉特效的 section

### 4.2 创建入口（多方式支持）

| 方式 | 说明 | 优先级 |
|------|------|--------|
| **Figma Make / 类似工具** | 在 Vibe coding 工具中直接创建和迭代 block / component / theme | 主入口 |
| **Web 发布页** | 从外部复制组件代码，粘贴到发布界面 | 支持 |
| **MCP** | 由 AI 工具直接读取、发布和更新 registry 资产 | 支持 |
| **设计稿导入** | 通过 Figma MCP 等方式导入设计稿或变量 | 支持 |

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

**开发顺序：先让 block bundle 能被安装和升级，再把设计师创建与迭代链路补完整。**

### Phase 1：让 block bundle 可安装、可升级（先做）

1. **预设 blocks**：Hero Section、FAQ、Pricing Card 等写入数据库
2. 实现 Registry API：动态生成 shadcn 格式的 `registry.json`、`/r/[name].json`
3. 实现安装与版本追踪基础：安装来源、版本读取、升级判断
4. 实现 MCP：`list_components`、`get_component`，并逐步扩展到安装/升级相关能力
5. 验证：AI 能正确查询、安装并升级这些预设 blocks

### Phase 2：让设计师创建与迭代 block 成为主流程

1. 发布界面：支持 block bundle / theme 的上传、预览与版本化
2. 基本检查：确保 bundle 可正常预览、安装和升级
3. 打通 Figma Make 等 Vibe coding 工具中的创建与迭代
4. 让设计师能直接通过 AI 工作流更新已有资产

### Phase 3：沉淀 component 并形成前端资产供应链

1. 从 block 中逐步抽取和沉淀 `registry:ui`
2. 组件/模块/主题浏览与搜索
3. 更强的安装锁定、升级建议与回滚能力
4. 多项目、多团队、版本管理
5. 与 Design Tokens、collection scope 等打通

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
| 与自部署匹配 | 企业自部署 Cozy Registry 时，MCP 指向其 registry URL |

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
Registry API（/api/registry.json, /api/r/[owner]/[name].json）
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
- [x] Registry API（/api/registry、/api/r/[owner]/[name]）
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

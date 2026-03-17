# Namespace Registry × Library × Block：发布与依赖解析规范

> 目标：在**不改变设计师「提交一个可预览 bundle」心智**的前提下，让系统仍能逐步沉淀出**可维护的组件库（Library）**，并与 shadcn 的 namespaced registry 体验对齐（`@namespace/name`、依赖解析、去重与覆盖策略）。

相关文档：

- `docs/RESOURCE_TYPES.md`：资源类型总览（样式/图标/组件/Block 的定位与存储形态）
- `docs/COMPONENT_UPDATES.md`：安装锁文件与升级约定（`cozy-registry.lock.json`、版本查询）

---

## 1. 术语与范围

### 1.1 资源类型（与现有实现对齐）

- **Block**：面向场景的 UI 片段（Hero、Pricing、FAQ 等）。`type = "registry:block"`.
- **Component（Library Component）**：面向复用的基础 UI（Button、Dialog、Input 等）。`type = "registry:component"`.
- **Theme**：主题/设计 token 的 CSS 或配置。`type = "registry:theme"`.

> 注：本 SPEC 重点约束 Block 与 Component 的**发布形态**与**依赖解析策略**；Theme 主要用于依赖注入（预览/安装）。

### 1.2 “Bundle” 与 “Item”

- **Registry Item**：数据库中的一个条目（`registry_items`），对外输出为 shadcn registry item JSON（`name/type/title/files/dependencies/registryDependencies`）。
- **Bundle（多文件）**：一个 item 的 `files` 里包含多个文件（相对路径），用于表达“一个提交包含多个源码文件”。

### 1.3 路径与依赖字段

- **相对路径依赖**：`./`、`../` 开头的 import（以及同 bundle 内文件引用）。
- **Bare module specifier**：非相对/非绝对的 import（如 `react`、`clsx`、`lucide-react`、`@/components/ui/button` 等）。
- **dependencies**：运行时/构建期需要的第三方包依赖列表（bare specifier）。
- **registryDependencies**：对其它 registry item 的依赖，形如：
  - `@owner/name`
  - `@owner/name@1.2.3`（可选版本 pin）

---

## 2. 设计目标（产品与工程共同约束）

- **设计师友好**：提交时只需保证“可预览”，不强迫形成组件目录。
- **工程可控**：Library 侧可控的命名、路径、去重、升级与兼容策略。
- **可演进**：允许 Block 中存在重复 Button；但当需要沉淀到 Library 时，可逐步“抽取/依赖化”。
- **与 namespace registry 兼容**：未来可通过 `components.json` 的 `registries` 配置接入 shadcn CLI 风格的 `@namespace/name` 消费方式。

---

## 3. 发布规范：Block（设计师提交，默认自包含）

### 3.1 发布形态

Block 发布时允许（且默认）为**单 item 多文件 bundle**：

- **相对路径引用的源码**：必须作为文件包含在同一个 item 的 `files` 中。
- **bare import 的依赖**：不得内联到 `files`；应体现在 `dependencies`（第三方包）或 `registryDependencies`（其它 registry item）。

### 3.2 允许重复（去重不是 Block 的责任）

- Block 允许在 bundle 内包含 `Button.tsx`、`Input.tsx` 等“基础组件副本”。
- Block 允许多个不同 Block 各自携带不同实现的 Button。

> 解释：Block 的目标是“可预览、可复制”，不是“统一组件库”。重复是可接受的阶段性成本。

### 3.3 Block 的推荐 namespace（逻辑分组）

建议将 Block 的资源放入单独 namespace（或逻辑分组）以区分心智：

- `@blocks/...`：Block（允许自包含与重复）

> 是否用 namespace 分组由产品决定；但必须在 UI/列表/安装入口上明确区分 Block 与 Library。

---

## 4. 发布规范：Library Component（沉淀复用，默认依赖化）

### 4.1 发布形态（推荐）

组件库中的组件应遵循“**一个组件一个 item**”原则：

- `Button`、`Dialog`、`ButtonGroup` 分别为独立 item。
- `Dialog` 引用 `Button` 时，应通过 `registryDependencies` 依赖 `@ui/button`（示例 namespace），而不是把 Button 源码复制到自己的 `files` 中。

### 4.2 Library 的强约束（建议逐步启用）

当 item 被标记/发布为 Library 时，启用以下约束：

- **命名约束**：name 唯一、稳定；禁止随意更改（以避免下游安装漂移）。
- **输出路径约束（canonical path）**：Library item 的 `files[].path` 应落在约定前缀下（例如 `components/ui/*` 或团队约定路径），以便依赖合并与冲突判定。
- **禁止内联其它 Library 组件**：如果源码里出现相对路径引用到“库组件目录”，应改为 `registryDependencies`。

### 4.3 Library 的推荐 namespace

建议将 Library 资源放入单独 namespace：

- `@ui/...` 或 `@lib/...`：基础组件（强约束、依赖化）
- `@themes/...`：主题（可选）

---

## 5. 依赖解析与合并（Resolver 规范）

> 该部分用于“安装到项目”与“预览注入依赖”共用的统一规则。实现上建议抽成独立 resolver（如 `lib/registry-resolver.ts`）。

### 5.1 解析输入

给定一个入口 item（`@owner/name[@version]` 或路由参数 `owner/name?v=`），resolver 必须：

- 拉取入口 item 的 `files/dependencies/registryDependencies`
- 递归拉取所有 `registryDependencies`
- 产出一个“安装计划（install plan）”

### 5.2 递归与拓扑顺序

- 必须递归解析 `registryDependencies`（深度优先或广度优先皆可）。
- 必须检测循环依赖并报错（例如 `A -> B -> A`）。
- 合并顺序为“依赖先、入口后”（拓扑排序）；后合并的文件在冲突时具备更高优先级（见 5.3）。

### 5.3 去重与冲突策略（核心）

当多个 item 产生相同目标写入路径（`files[].path` 相同）时：

- **默认策略（Library 优先）**：
  - 若冲突来自 **Library 组件** 与 **Block 自带副本**：以 **Library** 为准（Block 副本应被忽略或重写引用）。
  - 若冲突来自两个 **Library 组件**：必须进入“覆盖策略”流程（见 6）。
  - 若冲突来自两个 **Block**：允许“后者覆盖前者”，但应提示存在冲突（用于调试）。

> 与 shadcn 的“dedupe by path, last one wins”一致，但对 Library/Block 给出更明确的默认行为。

### 5.4 依赖字段合并

resolver 合并输出时需同时合并：

- `dependencies`：集合去重后排序输出（仅保留 bare specifier）。
- `registryDependencies`：保留用于可追溯；但最终安装时以 resolver 的递归结果为准。

### 5.5 预览的特殊规则（Theme 注入）

预览环境中，resolver 至少需要支持：

- 在入口 item 渲染前注入其（递归）依赖中的 `registry:theme` 的 CSS（顺序与拓扑一致）。

---

## 6. 覆盖（Override）与用户询问（Prompting）

当出现“需要覆盖”的情况（主要发生在 Library 场景），系统必须提供明确的决策点：

### 6.1 触发覆盖询问的条件

- 安装计划中存在**同路径冲突**，且冲突双方至少一方为 Library item。
- 发布到 Library 时发现目标 `@ui/name` 已存在，且内容不同（需要新版本/替换）。

### 6.2 用户可选项（最小集合）

对单个冲突（同路径/同组件名），至少提供：

- **覆盖**：以新内容生成新版本（bump version），并更新引用方依赖到新版本（可选）。
- **不覆盖 / 采用已存在的 canonical**：保留旧组件作为依赖，丢弃新提交中的副本，并自动把引用改为依赖（需要有重写能力时启用）。
- **另存为新组件**：改名发布（如 `button-v2`），避免破坏兼容性。

> 在纯 Block 流程中，可不弹窗，采用默认策略；在 Library 发布/安装中必须可控、可审计。

---

## 7. 提交流程建议（不强迫设计师“建组件库”）

### 7.1 两阶段心智（推荐）

- **阶段 A：Submit as Block（默认）**
  - 目标：快速产出可预览产物（自包含 bundle）
  - 允许重复与自由路径

- **阶段 B：Promote to Library（可选操作）**
  - 目标：沉淀为可复用组件（拆分为独立 item + registryDependencies）
  - 触发覆盖策略与 canonical 约束

### 7.2 从 Block 提升到 Library 的标准动作（建议）

当用户选择 Promote：

- 识别 bundle 内“可复用组件候选”（如 `Button.tsx`、`Input.tsx`）
- 将候选组件发布为 `@ui/<name>`（新建或覆盖询问）
- 将原 Block 中对候选组件的引用改为 `registryDependencies` + import 重写（可选）

---

## 8. 数据与 API 约束（与现有实现的映射）

- **多文件 bundle**：使用现有 `createRegistryItem` / `createRegistryItemVersion` 的 `files: Record<string,string>`。
- **版本 pin**：使用 `@owner/name@version`（在 `registryDependencies` 内）与 `?v=`（HTTP 获取版本）。
- **输出 JSON**：维持 shadcn registry item schema 的 `files[]` 形态。

---

## 9. 非目标（明确不做什么）

- 不要求设计师在提交阶段维护全局“唯一 Button”。
- 不要求所有 Block 都依赖 Library；允许 Block 自包含长期存在。
- 不在第一版强制实现“自动重写 import”（可以先做到覆盖询问 + 依赖约束）。


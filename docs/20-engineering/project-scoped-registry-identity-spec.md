Status: proposed
Owner: engineering
Last updated: 2026-04-03
Source of truth: yes

# Project-Scoped Registry Identity Spec

本文定义 Cozy Registry 的正式 identity contract 如何从当前的 `owner + name` 升级到 `owner + project + name`。

目标不是单纯放宽唯一约束，而是让组件的正式身份、解析路径和产品实际场景保持一致。

## 1. Problem Statement

当前系统的大部分主路径仍然默认：

- 同一个 owner 下，`name` 唯一
- 读取路径通常按 `owner + name` 查 item
- preview、publish/update、dependency ref、API route 都隐含这个前提

但从产品场景看，这个前提已经不成立。

同一个组织完全可能同时存在：

- `design-system/Button`
- `landing/Button`
- `dashboard/Button`

它们都叫 `Button`，但属于不同设计上下文与项目语义。

如果系统继续强制“同 owner 下 name 全局唯一”，用户只能把上下文硬塞进名字里：

- `landing-hero-button`
- `dashboard-primary-button`

这会带来：

- 名称污染
- identity 不自然
- 读写路径和 preview 命中越来越脆弱

因此这不是数据库约束的小问题，而是 **identity contract 尚未完成升级**。

## 2. Goals

- 允许同一 owner 下在不同 project 中存在同名组件
- 让 project 成为 canonical identity 的一部分
- 让 preview / publish / dependency ref / install / MCP 共享同一套 identity 规则
- 在开发阶段优先保证新 identity 模型干净、一致，而不是长期兼容旧路径

## 3. Non-Goals (v1)

以下能力不属于本次 identity 升级第一阶段：

- 自动将所有旧 ref 批量迁移到新 ref
- 为历史 item 设计完整的长期双轨兼容模型
- 自动为所有历史 item 回填完美 project 归属
- 多级 namespace（例如 owner/project/collection/name 之外再嵌套更多层）

## 4. Decision

正式身份模型升级为：

- `owner + project + name`

也就是说：

- `project` 不再只是 collection / grouping 标签
- `project` 是正式 namespace
- canonical ref 必须包含 `project`
- 开发阶段的新实现不再把 `owner + name` 视为长期 contract

## 5. Canonical Identity

### 5.1 Canonical Ref Format

推荐 canonical ref：

- `@owner/project/name`
- 带版本时：`@owner/project/name@version`

示例：

- `@indeed-cozy/design-system/button`
- `@indeed-cozy/landing/button`
- `@indeed-cozy/dashboard/button@1.2.0`

这里的 `project` 必须理解为：

- **稳定 namespace key**

而不是可随时改名的展示字段。

### 5.1.1 Stable Namespace Key vs Display Slug

本 spec 明确要求：

- canonical identity 中使用的 `project` 必须是稳定、不可漂移的 namespace key
- 展示层可以继续有 title / display name
- 用户可见 slug 若允许变更，也不能直接充当 canonical identity 的唯一来源

允许的实现方式有两种：

1. **直接将 project slug 视为不可变**
2. **引入独立的 stable namespace key，并让当前 slug 只做显示/路由别名**

但无论采用哪种实现，系统 contract 必须满足：

- 一旦某个 item 被发布到某个 canonical project namespace，下列身份都不能因为展示层改名而漂移：
  - canonical ref
  - `registryDependencies`
  - install provenance
  - lockfile coordinates
  - preview / artifact identity

因此，若现有 `registryProjects.slug` 被允许改名，则 **不能** 直接把它当作 canonical identity 中的 `project` 字段使用，必须补一层稳定 namespace key。

### 5.2 Why `project` Must Be In The Ref

如果允许 org 内 project-scoped 重名，但 canonical ref 仍停留在 `@owner/name`，就会在这些地方产生歧义：

- preview route
- `/api/r/...`
- `registryDependencies`
- MCP read / publish / update
- install provenance / lockfile

因此 project 必须进入 ref，而不是只存在于元数据或筛选条件里。

## 6. Project Semantics

系统必须明确：

- `project` 是 namespace
- 不是单纯 collection / 标签

这意味着：

- 若 project 只是分组，则不应允许同 owner 重名
- 若允许同 owner 在不同 project 中重名，则 project 必须进入 resolution contract

本 spec 明确选择后者。

### 6.1 Canonical Project Membership

本 spec 进一步明确：

- 每个 registry item 必须 **有且仅有一个 canonical project namespace**

也就是说：

- `owner + project + name` 必须是单值 identity
- item 不能同时拥有多个 canonical project

### 6.2 Relationship to Existing Multi-project Grouping

当前系统已有：

- `registry_project_items`

这是一种多对多分组/链接关系，适合作为：

- collections
- references
- curated project views

但它不足以承担 canonical identity。

因此需要明确区分两类关系：

1. **Canonical project namespace**
   - 身份性字段
   - 每个 item 只能有一个
   - 进入 canonical ref、preview identity、publish/update resolution、dependency graph

2. **Additional project links**
   - 非身份性引用/收藏/分组
   - 可继续多对多存在
   - 不影响 canonical ref

若不做这一区分，那么：

- `owner + project + name` 不是单值 identity
- publish/update/preview/dependency graph 仍会不稳定

## 7. Database and Uniqueness

### 7.1 Required Uniqueness Direction

唯一性应从：

- user/org + `name`

升级为：

- user/org + `project` + `name`

### 7.2 Data Model Implication

`registry_items` 与版本写路径必须能明确记录：

- owner scope
- canonical project scope
- name

如果当前 `project` 只是 join/link 关系，不足以支撑 identity，就需要补充：

- item 的 canonical project identity
- 或单独的 namespace 字段 / namespace key

建议方向：

- 在 item 主记录上直接存 canonical project namespace key
- 不再依赖 `registry_project_items` 反推 canonical project

### 7.3 Write Safety

在 identity 升级完成前，不应再继续扩散“同 owner 下 name 全局唯一”的隐式写路径假设。

## 8. Read Resolution Contract

### 8.1 New Primary Resolution

未来主路径必须优先按：

- `owner + project + name`

解析 item。

### 8.2 Development-Stage Legacy Handling

当前项目仍处于开发阶段，因此本 spec 不把旧 `owner + name` 路径的长期兼容当作一等目标。

推荐策略：

- 新实现优先只保证 `owner + project + name`
- 若历史数据与新模型冲突，允许人工删除或脚本清理
- 不再为历史路径设计长期双轨 resolution contract

若某些入口在过渡期仍暂时接受 `owner + name`：

- 该行为仅视为短期开发兼容
- 不应写入长期系统 contract
- 一旦与 project-scoped identity 冲突，应优先报错或下线旧入口，而不是继续扩展兼容逻辑

### 8.3 No Silent Default Project Selection

系统不应在缺失 project 的场景中偷偷推断默认 project。

对于新模型：

- project 必须显式提供
- “无 project item” 只应被视为待清理的历史开发数据

## 9. Route and API Contract

### 9.1 Read Routes

以下读取路径都必须逐步支持 project-scoped identity：

- `/r/...`
- `/preview/...`
- 组件详情页
- MCP get/list helpers

推荐路径形态：

- `/r/{owner}/{project}/{name}`
- `/preview/{owner}/{project}/{name}`
- `/registry/{owner}/{project}/{name}`

### 9.1.1 Route Parsing and Legacy Owner Paths

当前系统已经存在一些 legacy owner path / layered owner 兼容逻辑，因此新的 project-scoped route 不能仅靠“多一段 path”模糊推断。

本 spec 明确要求：

- route parser 必须先解析 **owner identity**
- 再解析 **project namespace**
- 最后解析 **name**

推荐兼容方向：

1. 对显式 project-scoped identity，引入统一 parser，支持：
   - canonical ref `@owner/project/name`
   - route `/r/{owner}/{project}/{name}`
   - route `/preview/{owner}/{project}/{name}`
2. 对 legacy layered owner path，优先保持旧 parser 语义
3. 若某条路径同时可能被解释为：
   - layered owner path
   - 或 `owner/project/name`
   则必须返回显式歧义或通过更高层入口消歧，不能静默猜测

也就是说：

- 新路由 contract 不能建立在“path segment 数量碰巧不同”的脆弱假设上
- 必须通过统一的 identity parser 做决策

### 9.2 Publish / Update

publish/update 不应再只靠：

- `name = "dialog"`

去推断“就是这个 owner 下唯一 dialog”。

未来写路径必须显式提交：

- target owner
- target project
- name

或等价的 canonical target ref。

## 10. Dependency Reference Contract

### 10.1 Registry Dependencies

若 identity 升级，`registryDependencies` 也必须升级。

推荐格式：

- `@owner/project/name`
- `@owner/project/name@version`

否则以下依赖无法无歧义表达：

- `@indeed-cozy/design-system/button`
- `@indeed-cozy/landing/button`

### 10.2 Resolver Implications

resolver、graph builder、dependency health、reverse ref 查询都必须把 project 视为 identity 的组成部分。

不能继续只按：

- owner
- name

做 graph key。

## 11. Preview and Artifact Implications

preview identity、artifact key、artifact lookup 也必须带上 project。

否则以下情况会冲突：

- `@indeed-cozy/design-system/button`
- `@indeed-cozy/landing/button`

即使它们是不同 item/version，也可能因为旧 key 模型而互相污染。

推荐 artifact identity 至少包含：

- owner
- project
- name
- version
- storyId
- mode

## 12. Install Protocol Implications

install / provenance / lockfile 必须支持 project-scoped coordinates。

目标是：

- 项目侧安装状态能无歧义记录来源
- provenance header 与 lockfile 不再把不同 project 下的同名组件混为一谈

这与现有安装协议中已经开始出现的 project-scoped coordinates 方向保持一致，但要提升为系统正式 contract。

## 13. Backward Compatibility Strategy

### Phase 1: Introduce Canonical Scoped Identity

- 内部数据模型与 resolver 支持 `owner + project + name`
- 引入 stable project namespace key（或明确将 slug 锁定为不可变）
- 新 ref 语法 `@owner/project/name` 成为推荐标准
- 新写路径优先要求 project

### Phase 2: API / UI Surface Migration

- 页面、preview、`/api/r`、MCP 全面支持 project-scoped path/ref
- detail UI 明确显示 project namespace

### Phase 3: Dependency and Install Migration

- `registryDependencies` 统一迁移到 project-scoped ref
- install / lockfile / provenance 优先写 project-scoped identity

### Phase 4: Development Data Cleanup

- 清理旧的重复同名 item
- 删除与新 identity model 冲突的历史开发数据
- 不要求为这些旧数据保留长期兼容路径

## 14. Suggested Product Rule for Missing Project

长期模型里 project 应始终存在。

在当前开发阶段，推荐直接执行：

- 新 item 必须显式属于一个 canonical project
- 没有 project 的旧 item 视为历史开发数据
- 若这些旧数据与新模型冲突，允许直接删除或人工整理

也就是说：

- “missing project” 不是一个需要长期兼容的正式产品状态
- 它只是迁移期间允许存在、但应逐步清理掉的开发遗留状态

## 15. Acceptance Criteria

当 identity 升级完成时，应满足：

- 同一 owner 下允许不同 project 中存在同名组件
- preview / read / publish / update / dependency ref 不再因同名而歧义
- 新系统主路径不再依赖 `owner + name` 全局唯一假设
- 与新模型冲突的历史开发数据可被清理，而不是继续把兼容逻辑扩展进主 contract

## 16. Agent Execution Checklist

### Agent A: Identity Model and Schema

目标：

- 定义 project-scoped identity 在数据层的正式表达

任务：

- 梳理 item 与 project 的当前关系
- 定义唯一约束升级方向
- 确定 `project` 如何进入 canonical identity

验收：

- 数据模型可以表达同 owner 不同 project 的同名 item

### Agent B: Resolver and Read Path

目标：

- 让读取与解析层支持 `owner + project + name`

任务：

- 更新 item lookup、resolver、preview lookup、artifact lookup
- 为 legacy `owner + name` 增加歧义处理

验收：

- 多 project 同名时不再静默误命中

### Agent C: Publish / Update Contract

目标：

- 写路径显式带上 project identity

任务：

- 更新 publish / update API
- 更新 MCP publish / get / read contract
- 明确 target project 解析逻辑

验收：

- publish/update 不再依赖 “同 owner 下 name 唯一”

### Agent D: Dependency Ref and Install Protocol

目标：

- 让依赖 ref 与安装协议跟上 identity 升级

任务：

- 更新 `registryDependencies` ref format
- 更新 install / provenance / lockfile coordinate handling

验收：

- project-scoped 同名组件可被无歧义依赖和安装

## Related

- [Registry Dependency Management Spec](./registry-dependency-management-spec.md)
- [Registry Resource Lifecycle Spec](./registry-resource-lifecycle-spec.md)
- [System Overview](../00-overview/system-overview.md)

Status: living (principles); implementation tracked in §十二与 engineering docs
Owner: product
Last updated: 2026-03-27
Source of truth: partial — 产品原则仍以本文为准；落地进度见 §十二

# 团队功能规划

## 目的

这份文档用于定义 Cozy Registry 的团队功能 MVP，回答以下问题：

- 团队功能要先解决什么问题
- 团队在产品里应该是什么抽象
- 权限、界面、资源归属与 AI 范围控制应该怎么设计
- MVP、Beta 与更长期阶段各自做到什么程度

这里先讨论产品规划，不直接绑定数据库或 API 细节。

---

## 一、为什么现在要做团队功能

Cozy Registry 的核心价值不是“把组件挂在一个网页上”，而是让一组人共同维护一套可以被人类和 AI 一起使用的前端资产。

当前个人 owner 模型已经足够支撑：

- 个人发布组件、block、theme
- Figma Make / Cursor 接入个人 registry
- 个人 collection 作为 AI 范围控制

但当我们开始面向真实团队使用时，会立刻遇到这些问题：

- 资产归属不该只属于某一个人
- collection 和 policy 需要团队共同维护
- AI 应该在团队定义的边界里选择资源，而不是按个人 owner 随机选择
- 发布、更新、安装与 MCP 接入需要成为团队工作流，而不是个人实验

所以团队功能的本质不是“多人共用一个空间”，而是：

**让一个团队共同维护一套可被 AI 调用的 design-to-code registry。**

---

## 二、产品原则

### 1. Team 是 scope，不是另一套产品

团队不应该被做成一套独立产品线。

更合理的抽象是：

- Personal 是一个 scope
- Team 也是一个 scope

用户只是在不同 scope 之间切换，而不是进入两套完全不同的界面。

这意味着：

- `My items / Collections / Settings` 这组信息架构仍然成立
- 只是当前 scope 可能是个人，也可能是团队

### 2. 团队功能优先服务资产协作，而不是组织管理

MVP 不需要先做复杂的组织系统。

团队功能首先应该围绕：

- 资源归属
- 成员权限
- AI 可见范围
- 发布与安装工作流

而不是一开始就做：

- 账单
- 多层级组织架构
- 复杂审批流
- 自定义角色引擎

### 3. 人类限定范围，AI 在范围内选择

这个原则在团队功能里会更重要。

团队功能不是单纯让多人都能看到资源，而是让团队能够定义：

- 哪些 collection 是 AI 可以用的
- 哪些资源只在某个团队内部可见
- 哪些 token 只能访问某个团队的特定范围

一句话：

**Humans define the team design space. AI chooses within it.**

---

## 三、MVP 要先解决的 4 个问题

### 1. 共同拥有资产

组件、block、theme、collection 需要能归属于团队，而不是只能归属于个人。

### 2. 共同管理权限

团队成员需要有清晰的角色与权限边界，例如：

- 谁能发布
- 谁能更新
- 谁能删资源
- 谁能管理成员
- 谁能管理 team token / MCP access

### 3. 共同限定 AI 范围

团队应该能用 collection 和 policy 定义 AI 的可见范围，避免：

- landing page 任务跑去选 dashboard block
- marketing 团队误用内部 admin 组件
- 团队资产和个人实验资产混在一起

### 4. 共同形成设计到开发的工作流

团队功能要让以下流程成立：

- 设计师从 Figma Make 发布到 team registry
- 开发从 Cursor / shadcn 安装 team-owned resources
- AI 在 team scope 内推荐、规划和安装资源

---

## 四、核心产品抽象

## 4.1 Scope

MVP 建议统一成一个 scope 抽象：

- `personal`
- `team`

每个资源都属于某个 scope，而不是只属于某个 user。

这样后续这些能力都可以复用同一套思路：

- ownership
- storage path
- MCP access control
- token policy
- collections
- install / status / upgrade

## 4.2 Team

Team 是一个共享 scope，至少包含：

- `name`
- `slug`
- `avatar` 可选
- `members`
- `collections`
- `resources`
- `settings`

## 4.3 Team members

成员属于 team，并带角色。

MVP 先只做 3 档角色：

- `owner`
- `editor`
- `viewer`

不建议在 MVP 做更复杂的 RBAC。

---

## 五、权限模型

## 5.1 Owner

Owner 可以：

- 管理 team 设置
- 管理成员
- 管理 team token / MCP access
- 发布、更新、删除资源
- 管理 collections

## 5.2 Editor

Editor 可以：

- 浏览资源
- 发布和更新资源
- 管理 collections
- 安装和复用资源

Editor 不可以：

- 管理成员
- 更改 team 设置
- 管理 team token

## 5.3 Viewer

Viewer 可以：

- 浏览资源
- 安装和复用资源

Viewer 不可以：

- 发布资源
- 修改 collections
- 修改 team 设置

---

## 六、团队功能在界面上的 MVP 形态

## 6.1 Scope switcher

最关键的入口是 scope switcher。

用户进入 app 后，应能切换：

- `Personal`
- `Team A`
- `Team B`

这是团队功能最重要的 UI，不应该藏太深。

建议位置：

- 当前 app header 的用户区域附近
- 或侧边栏顶部

## 6.2 Team dashboard

进入某个 team 后，应继续沿用现在的 dashboard 结构，但内容变成团队语义：

- Team hero
- 资源统计
- Collections 入口
- 最近更新
- 空状态发布入口

也就是说：

- `My items` 在 team scope 下可以变成 `Team items`
- 页面结构保持一致，减少学习成本

## 6.3 Team collections

Collection 在团队功能里不只是组织方式，更是 AI 范围控制器。

因此 team collections 页面应成为第一批重点页面之一。

## 6.4 Team settings

MVP 的 team settings 至少应包括：

- Team name / slug
- Members
- Roles
- API tokens / MCP access

---

## 七、与 AI / MCP 的关系

团队功能不是“以后再说的协作功能”，而是直接影响 MCP 能力质量。

## 7.1 Team scope 是 AI 的第一层上下文

当 AI 接入 registry 时，最重要的第一层限制不应该只是“当前用户是谁”，而应该是：

- 当前在 personal scope 还是 team scope
- 当前 team 下允许访问哪些 collections

## 7.2 Team collection 是 AI 的第二层范围控制

在 team 内，collection 是更细的一层限定。

理想使用方式：

- 人类指定某个 team
- 再指定一个或几个 collections
- AI 只在这个空间里选型和安装

## 7.3 Team token 会是关键能力

团队功能一旦上线，后续很自然会需要：

- team-level API token
- collection-scoped token
- read-only / publish-capable token

这会是 MCP / OAuth 权限粒度收敛的核心入口之一。

---

## 八、MVP 不建议现在就做的东西

为了避免团队功能过重，以下能力建议延后：

- 复杂组织层级（org / workspace / team 嵌套）
- 自定义角色系统
- 审批流
- 活动流 / 审计日志
- 账单与 seat 管理
- 团队级 marketplace / 外部分享中心
- 复杂 invite 状态机

这些都不是团队功能成立的前提。

---

## 九、推荐的演进顺序

## Phase A：Team foundation

目标：

- team scope 成立
- 资源可归属 team
- 成员和角色成立
- scope switcher 成立

这一步完成后，产品就从“个人 registry”变成“个人 + 团队 registry”。

## Phase B：Team publishing flow

目标：

- Figma Make 可以发布到某个 team
- Cursor / shadcn 可以从某个 team 安装资源
- Team dashboard / collections 稳定可用

## Phase C：Team AI scope

目标：

- team token
- collection-scoped access
- AI 在 team + collection 范围内检索和选择

## Phase D：Collaboration polish

目标：

- invites
- activity history
- audit / history
- 更完整的 admin UX

---

## 十、建议的 MVP 决策

为了减少后续反复，建议先把以下 5 条作为团队功能 MVP 的基本决定：

1. **Team 是 scope，不是另一套产品**
2. **角色先只做 owner / editor / viewer**
3. **资源归属统一抽象为 scope**
4. **Collection 是团队 AI 范围控制的核心手段**
5. **Team token 是后续 MCP 权限粒度的主要落点**

---

## 十一、当前建议的后续动作（历史）

以下条目在 2026-03 前用于「从规划进入实现」；工程设计稿、MVP 页面范围与首版 schema/API/UI 已按此方向落地。后续增量见 §十二。

---

## 十二、实现状态与长期路线图对照（2026-03-27）

对照 §九 Phase A–D 的推荐顺序，当前代码库大致状态如下（用于规划评审，非逐条验收清单）。

| 阶段 | 目标摘要 | 当前状态 |
|------|----------|----------|
| **Phase A：Team foundation** | team scope、资源可归 team、成员与角色、scope switcher | **已基本达成**：Better Auth organization + teams；`registry_items.team_id`、`registry_collections.owner_team_id`、会话 `activeOrganizationId` / `activeTeamId`；侧边栏 `WorkspaceScopeSwitcher`；`getWorkspaceContextForSession`；发布侧 `getWritableTeamTargetForUser`（owner/editor 可写）。 |
| **Phase B：Team publishing flow** | Figma Make → team、Cursor/shadcn 从 team 安装、dashboard/collections 稳定 | **已基本收口（2026-03-27）**：dashboard/collections team scope；`publishScope: "team"` + `teamId`；MCP `list_components` 支持 `teamId`；`get_component` / `get_component_bundle` / `get_component_versions` 的 `owner` 支持 `orgSlug/teamSlug`；团队 ref `@orgSlug/teamSlug/itemName`、bundle 源 `/api/r/{org}/{team}/{name}` 与 install-protocol / lockfile 对齐；预览 `/preview/{org}/{team}/{name}` 重定向到统一预览；依赖解析 `getRegistryDependencyAccessForRef` 支持团队 owner 路径。剩余：按环境做端到端验收（Figma 连接器里显式传 `teamId`）。 |
| **Phase C：Team AI scope** | team token、collection 级访问、AI 在 team+collection 内检索 | **部分达成**：`registry_api_key_policies.owner_team_id` + Settings 中按当前 team scope 配置策略，但 **API key 仍为用户名下密钥**（非独立「团队主体持有 token」）；collection 与类型限制可走 policy。**不等同**于独立的 team-scoped OAuth token 或只读/发布分级 token 的完整产品化。 |
| **Phase D：Collaboration polish** | invites、活动/审计、更完整 admin UX | **部分达成**：组织/团队邀请流与 Settings 内成员列表、待处理邀请、owner 改名/移除成员等；**活动流、审计日志、完整 admin** 未作为 MVP 交付。 |

**与 §八「暂不做」清单**：复杂组织层级、自定义角色引擎、审批流、账单、团队级 marketplace 等仍属延后项，与当前实现一致。

**建议的下一批文档/产品动作**（在 §十二基础上）：为 Phase B 补「对外安装与 ref」验收标准；为 Phase C 明确「用户密钥 + team policy」与「未来 team 主体 token」的边界；Phase D 按需拆用户故事。

---

## 一句话总结

团队功能的目标不是“让多人共用一个列表”，而是：

**让一个团队共同维护一套可以被人和 AI 一起使用的 source-native 前端资产。**

只要这个目标抓稳，MVP 就应该优先做：

- team scope
- role model
- team-owned assets
- collection-first AI boundaries

而不是一开始就去做复杂的组织管理平台。

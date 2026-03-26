Status: proposed
Owner: engineering
Last updated: 2026-03-26
Source of truth: no

# Team 权限矩阵（MVP）

## 目的

这份文档定义团队功能 MVP 的权限边界，用于指导：

- UI 是否展示某个入口
- API 是否允许某个动作
- MCP / token scope 后续如何映射

这份文档建立在以下前提上：

- Organization 与 Team 由 Better Auth organization plugin 提供
- Cozy Registry 的业务资源优先归属于 `team`
- 角色先只做：
  - `owner`
  - `editor`
  - `viewer`

相关文档：

- [team-workspaces-plan.md](../10-product/team-workspaces-plan.md)
- [team-data-model.md](./team-data-model.md)

---

## 一、权限设计原则

### 1. UI 可见性和后端授权要分开

页面里“看不见按钮”不等于真正没有权限。

因此每个权限点都要同时考虑：

- UI 是否显示入口
- API / MCP 是否真正校验

### 2. 团队权限优先围绕资产协作

MVP 的重点不是复杂管理系统，而是：

- 资源归属
- collection 管理
- 发布与更新
- AI 范围控制

### 3. 角色语义保持直接

当前不做复杂组合权限，直接按角色表达：

- `owner`
- `editor`
- `viewer`

这样更便于产品理解和用户沟通。

---

## 二、角色定义

## 2.1 Owner

Owner 是团队的管理者，拥有团队级管理权限和资源级完全权限。

Owner 可以：

- 管理 team 设置
- 管理 team 成员
- 管理 collections
- 发布、更新、删除资源
- 管理团队范围内的 token / MCP access（后续）

## 2.2 Editor

Editor 是团队的内容维护者。

Editor 可以：

- 浏览资源
- 发布资源
- 更新资源
- 管理 collections
- 安装和复用资源

Editor 不可以：

- 管理成员
- 修改 team 基础设置
- 管理团队 token / OAuth client 配置

## 2.3 Viewer

Viewer 是团队的只读消费者。

Viewer 可以：

- 浏览资源
- 查看详情
- 安装和复用资源

Viewer 不可以：

- 发布资源
- 更新资源
- 删除资源
- 修改 collections
- 修改 team 设置

---

## 三、Organization 层权限

Organization 是顶层容器，不是资源直接归属对象。

MVP 阶段建议把 organization 权限尽量收窄，避免过早做复杂平台管理。

## 3.1 当前建议暴露的 organization 级能力

### Owner / Admin（Better Auth 侧）

可以：

- 创建 team
- 查看 organization 下所有 team
- 管理 organization 成员的 team 分配（如果 Better Auth 提供该入口）

### 普通成员

可以：

- 查看自己所属的 team 列表

### 当前不建议在 MVP 暴露的 organization 级功能

- organization 级资源库
- organization 级 collections
- organization 级 token policy UI
- organization billing / seat 管理

原因：

- 会把团队功能从“协作空间”拉成“组织平台”
- 不是 MVP 的主要价值点

---

## 四、Team 层权限矩阵

下面这张矩阵回答：

- team 页面里哪些入口可见
- 哪些操作允许调用 API

### 4.1 Team 基础信息

| 能力 | owner | editor | viewer |
| --- | --- | --- | --- |
| 查看 team dashboard | yes | yes | yes |
| 查看 team settings | yes | no | no |
| 修改 team name / slug / avatar | yes | no | no |

### 4.2 Team 成员

| 能力 | owner | editor | viewer |
| --- | --- | --- | --- |
| 查看成员列表 | yes | yes | yes |
| 添加成员 | yes | no | no |
| 修改成员角色 | yes | no | no |
| 移除成员 | yes | no | no |

建议：

- MVP 可以允许 editor / viewer 查看成员列表
- 但只有 owner 能改

### 4.3 Team 资源

| 能力 | owner | editor | viewer |
| --- | --- | --- | --- |
| 查看资源列表 | yes | yes | yes |
| 查看资源详情 | yes | yes | yes |
| 发布新资源 | yes | yes | no |
| 发布新版本 | yes | yes | no |
| 编辑标题 / 描述 / metadata | yes | yes | no |
| 修改 visibility | yes | yes | no |
| 删除资源 | yes | yes | no |
| 安装资源 | yes | yes | yes |

说明：

- MVP 里删除权限可以先给 owner + editor，保持内容维护顺畅
- 如果后面风险感知变强，再把删除收回到 owner
- team item 的 canonical ref 后续推荐采用 `@orgSlug/teamSlug/itemName`

### 4.4 Team collections

| 能力 | owner | editor | viewer |
| --- | --- | --- | --- |
| 查看 collections | yes | yes | yes |
| 创建 collection | yes | yes | no |
| 编辑 collection title / slug / description | yes | yes | no |
| 添加 item 到 collection | yes | yes | no |
| 从 collection 移除 item | yes | yes | no |
| 删除 collection | yes | yes | no |

原因：

- collection 是 AI 范围控制器，也是内容组织器
- 对 Editor 来说，这是工作流核心能力，不应只留给 owner

### 4.5 Team tokens / MCP access（第二阶段）

| 能力 | owner | editor | viewer |
| --- | --- | --- | --- |
| 查看 team tokens | yes | no | no |
| 创建 team token | yes | no | no |
| 编辑 team token scope | yes | no | no |
| 删除 / revoke team token | yes | no | no |

MVP 第一阶段可以先不开放 UI，但权限语义建议先定住。

---

## 五、Resource 层权限规则

除了 team 角色，还需要几个更细的业务规则。

## 5.1 团队资源的 publish / update

条件建议为：

- 当前用户是该 team 成员
- 角色为 `owner` 或 `editor`

这条适用于：

- 创建 team-owned item
- 发布新版本
- 更新 metadata

补充说明：

- 浏览上下文可以来自 `activeTeamId`
- 但写入动作不应只依赖隐式 active scope
- publish / update 后续应支持显式 team target，并最终解析成明确的 `team_id`

## 5.2 团队资源的读取

条件建议为：

- 当前用户是该 team 成员

后续如果支持“team 资源公开”，再在 visibility 上做扩展。

MVP 里建议先保持：

- team 内资源默认 team-only

### 为什么

- 能更快形成清晰的协作边界
- 避免个人/团队/公开三层权限一起炸开

## 5.3 团队资源的安装

条件建议为：

- team 成员都可以安装

因为安装是消费动作，不应该卡得太严。

---

## 六、Collection 与 AI scope 的权限语义

这一层是 Cozy 的特色能力，不只是普通后台权限。

## 6.1 人类侧权限

### Owner / Editor

可以：

- 创建 team collection
- 调整 collection 内容
- 让 collection 成为 AI 推荐和安装的限定空间

### Viewer

可以：

- 读取 collection
- 在 collection 范围内浏览与安装

但不可以：

- 修改 collection

## 6.2 AI / MCP 侧语义

后续 team token 上线后，建议 scope 控制优先绑定到：

- `team_id`
- `allowedCollectionIds`
- `allowedTypes`

也就是说，MCP 侧最理想的权限表达应该像：

- 这个 token 能访问哪个 team
- 这个 token 在 team 内能访问哪些 collections
- 这个 token 能访问哪些资源类型

---

## 七、UI 层建议

## 7.1 Scope switcher

所有 team 成员都应该看得到：

- `Personal`
- 自己所属的 team 列表

但：

- 只有 owner 才能看到 team settings 入口
- editor/viewer 不显示该入口

## 7.2 Dashboard / Team dashboard

### Owner / Editor / Viewer

都能看到：

- team dashboard
- 资源统计
- 最近更新

### Owner / Editor

能看到：

- 发布入口
- collection 管理入口

### Viewer

不显示：

- 发布按钮
- collection 创建按钮

## 7.3 Settings

建议拆成两层：

- 个人 settings
- team settings

其中：

- 个人 settings：所有登录用户都有
- team settings：只有 owner 有

---

## 八、API / MCP 层建议

## 8.1 API 权限检查顺序

每个 team 相关接口建议统一检查：

1. 当前用户是否登录
2. 当前用户是否是该 team 成员
3. 当前角色是否满足该动作要求
4. 资源是否确实属于该 team

## 8.2 MCP 权限检查顺序（后续）

team token 上线后，建议统一检查：

1. token 是否有效
2. token 归属哪个 team
3. 请求的 team 是否匹配
4. collection 是否在 allowlist 中
5. 类型是否在 allowlist 中

---

## 九、当前推荐结论

MVP 权限矩阵建议采用：

- `owner`：team 管理 + 资源完全管理
- `editor`：资源与 collection 管理
- `viewer`：浏览与安装

并坚持以下边界：

- organization 只做顶层容器，不直接承载 registry 资产
- team 是 Cozy 业务资源的主要共享 scope
- collection 是 AI 范围控制的关键手段

---

## 一句话总结

**MVP 团队权限建议围绕“owner 管团队，editor 管内容，viewer 做消费”展开。**

这既足够清晰，也和 Cozy Registry 当前最重要的设计目标一致：  
让团队共同维护一套可以被人和 AI 一起使用的前端资产。

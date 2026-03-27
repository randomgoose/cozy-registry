Status: living (schema + principles); implementation snapshot见 §十一
Owner: engineering
Last updated: 2026-03-27
Source of truth: partial — 表结构与分层仍以本文为准；已实现细节见代码与 §十一

# Team 数据模型设计（MVP）

## 目的

这份文档把 [team-workspaces-plan.md](../10-product/team-workspaces-plan.md) 里的产品规划翻译成可实现的数据模型。

目标不是一步到位做一个通用组织平台，而是：

- 在不推翻现有个人 owner 模型的前提下
- 长出 organization + team 两层 scope
- 支撑 Team dashboard / collections / settings
- 为后续 team token / MCP scope 留扩展位

相关补充：

- [team-publish-target-spec.md](./team-publish-target-spec.md)

这版设计默认：

- **复用 Better Auth 的 organization / team / membership 能力**
- **不再自己重复设计 `organizations` / `teams` / `members` 身份表**
- **Cozy Registry 只新增业务归属字段**

---

## 一、设计原则

### 1. 尽量增量演进，不推翻现有 `userId` 模型

当前核心资产表已经稳定围绕个人 owner 工作：

- `registry_items.user_id`
- `registry_collections.owner_user_id`
- `registry_api_key_policies.owner_user_id`

如果为了“抽象更漂亮”而现在直接重构成一套完全新的 `scopes` 表，会把实现成本和迁移风险都抬高。

因此 MVP 更合理的做法是：

- 先保留现有 `user_id / owner_user_id`
- 为 team 场景增加 `team_id`
- 在应用层统一解释成 `scope`

也就是说：

- **DB 层先做双归属字段**
- **应用层再抽象成统一 scope**

### 2. Better Auth 负责身份层，Cozy 负责业务层

MVP 建议明确分层：

- **Better Auth organization plugin**
  - organization
  - organization members
  - team
  - team members
  - invites
  - active organization / active team
  - role / access control
- **Cozy Registry 自己的业务表**
  - `registry_items`
  - `registry_collections`
  - `registry_api_key_policies`
  - MCP / token policy

这样可以避免两种问题：

- 明明 Better Auth 已经有 organization 和 team，我们还重复造一套
- 把所有业务归属逻辑都塞进 auth 插件的表里，导致业务扩展困难

### 3. MVP 先只支持“资源归属到个人或团队二选一”

同一条资源记录不应该同时属于：

- 个人
- 团队

因此数据层应保持：

- `personal` 和 `team` 归属互斥

### 4. 组织和团队的职责分层

这里采用如下语义：

#### Organization

表示：

- 公司
- 工作室
- 顶层管理边界

用于承载：

- 成员总归属
- 顶层安全边界
- 顶层管理权限

#### Team

表示：

- organization 内的具体协作空间 / 资产空间

它可以按不同方式划分：

- 业务线，如 `trading` / `payments` / `platform`
- 资产或工作流域，如 `marketing` / `operations` / `localization`

对 Cozy 来说，真正的资源归属与 AI 范围控制，更适合落在 **team** 上，而不是 organization 上。

### 5. 角色先只做三档

MVP 只建模：

- `owner`
- `editor`
- `viewer`

即使 Better Auth 默认文档更常出现：

- `owner`
- `admin`
- `member`

这里也建议在 organization plugin 上做自定义 role mapping，保持 Cozy 产品语义稳定。

### 6. team token / team policy 预留扩展，但不要求第一阶段就全做完

团队功能第一阶段先重点落在：

- 资源归属
- scope 切换
- collections
- 页面与工作流

token 和 MCP policy 可以在第二阶段接上，但表设计需要预留空间。

---

## 二、推荐的数据表方案

## 2.1 复用 Better Auth organization + team tables

MVP 建议直接接 Better Auth 的 organization plugin，并启用 team 能力，使用其表来承载：

- organization
- organization members
- team
- team members
- invites
- active organization
- active team
- role / access control

因此 Cozy Registry 自己的数据模型里：

- **不再新增 `organizations` 表**
- **不再新增 `teams` 表**
- **不再新增 `organization_members / team_members` 表**

而是把这些身份层能力统一视为：

- Better Auth 提供

在产品和 UI 层，如果更自然，仍然可以继续用：

- Team
- Workspace

作为对用户的命名。

## 2.2 扩展：`registry_items`

当前关键字段：

- `user_id`

推荐新增：

- `team_id` `text | uuid` nullable references Better Auth `team.id`

MVP 语义：

- 个人资源：`user_id != null` 且 `team_id = null`
- 团队资源：`team_id != null` 且 `user_id = null`

建议增加约束（逻辑上至少成立，数据库层可用 check constraint）：

- `num_nonnulls(user_id, team_id) = 1`

建议索引：

- `index(team_id)`
- `unique(team_id, name)` for team-owned items
- 继续保留当前 `unique(user_id, name)` for personal items

为什么这里不建议直接存 `organization_id`：

- team 已经天然归属于某个 organization
- 直接存 `organization_id + team_id` 会产生冗余和一致性维护问题
- 对 Cozy 来说，资源真正的协作边界是 team，而不是 organization

## 2.3 扩展：`registry_collections`

当前关键字段：

- `owner_user_id`

推荐新增：

- `owner_team_id` `text | uuid` nullable references Better Auth `team.id`

MVP 语义：

- 个人 collection：`owner_user_id != null` 且 `owner_team_id = null`
- 团队 collection：`owner_team_id != null` 且 `owner_user_id = null`

建议约束：

- `num_nonnulls(owner_user_id, owner_team_id) = 1`

建议唯一键：

- 保留：`unique(owner_user_id, slug)`
- 新增：`unique(owner_team_id, slug)`

建议索引：

- `index(owner_team_id)`

备注：

- 这样 collection 仍然是“某个 scope 下的集合”
- 并且可以继续作为 AI 范围控制器
- 对团队功能来说，collection 更自然地归属于 team，而不是 organization

## 2.4 MCP publish scope 解析原则

团队功能接入 MCP 发布时，需要区分两类上下文：

- **active scope**
- **publish target**

这两者不能混为一谈。

### active scope

active scope 指的是：

- 当前网页 / 当前 Better Auth session 中的 `activeOrganizationId`
- 当前网页 / 当前 Better Auth session 中的 `activeTeamId`

它适合用于：

- dashboard / collections / settings 的默认浏览上下文
- UI 中“当前你正在看哪个 workspace”

### publish target

publish target 指的是：

- 这次 MCP 工具调用要把资源写入哪个 scope

它适合用于：

- `publish`
- `update`
- 未来任何会创建或修改 registry 资产的 MCP tool

### 设计结论

MCP 发布不能只依赖 Better Auth session 的 `activeTeamId`。

原因：

- MCP 客户端不一定和网页 UI 共用同一个会话上下文
- AI 工具调用是显式写入动作，不能把写入目标完全交给隐式 session 状态
- 否则很容易出现“用户以为发到 A team，实际发到 B team”的问题

### 推荐规则

MVP 建议采用：

1. **publish/update 工具优先接受显式 scope 参数**
   - 例如 `scope = "personal"` / `teamId = "..."` / `teamSlug = "..."`
2. **如果没有显式 scope**
   - 才 fallback 到当前 Better Auth session 的 `activeTeamId`
3. **如果仍然没有 active team**
   - 再 fallback 到 personal scope

### 数据落点

服务端在真正写入 `registry_items` / `registry_collections` 时，不应只保存“active organization”这类 UI 状态，而应解析成明确的业务归属：

- personal publish -> `user_id`
- team publish -> `team_id`

## 2.5 Registry ref 与 namespace 设计（Personal / Team）

团队发布真正落地前，需要先把 registry item 的可引用身份定义清楚。

这里有两个不同层次的问题：

- **publish target**：这次写入要落到哪个 scope
- **canonical registry ref**：这个资源之后如何被引用、安装、依赖、展示

这两者不能混为一谈。

### personal item

个人资源继续沿用当前的 canonical ref：

- `@userHandle/itemName`

例如：

- `@chen/button`

### team item

团队资源推荐采用三段式 ref：

- `@orgSlug/teamSlug/itemName`

例如：

- `@gate/trading/button`
- `@gate/marketing/hero-banner`

### 为什么不推荐 `@teamSlug/itemName`

如果只使用 team slug：

- 无法表达 team 属于哪个 organization
- team slug 就不得不做全局唯一
- 后续组织边界、权限和依赖引用都会变得模糊

而采用：

- `@orgSlug/teamSlug/itemName`

可以带来更稳定的性质：

- team slug 只需要在 organization 内唯一
- ref 自身就能表达组织归属
- 更适合未来用于 dependency / install / preview / publish response

### canonical ref 与数据库归属的关系

推荐关系如下：

- `@userHandle/itemName` -> `registry_items.user_id`
- `@orgSlug/teamSlug/itemName` -> `registry_items.team_id`

也就是说：

- personal item 的 owner 是 user
- team item 的 owner 是 team

不要把 team item 伪装成某个 user 的 owner。

### resolver 方向

当前系统里存在较多“owner = user handle”的假设。后续需要演进成更通用的 scope resolver。

推荐目标是：

- `@user/item` -> resolve to `{ type: "user", userId }`
- `@org/team/item` -> resolve to `{ type: "team", organizationId, teamId }`

后续实现时，建议逐步从：

- `resolveOwner(...)`

过渡到：

- `resolveRegistryScopeRef(...)`

以避免把 personal 与 team world 混在一起。

### MVP 实现顺序建议

这套 ref 设计先作为 **规范先行** 落下来，但不要求团队发布第一版就把 public URL / install / dependency 全链路一次做完。

推荐顺序：

1. 先支持 team-owned item 的落库与 team-aware publish target
2. 再补 team item 的 canonical ref resolver
3. 最后统一 dependency / install / preview / public route

也就是说：

- 先把“team 里真的能发资源”打通
- 再把“团队资源如何稳定对外引用”收完整

也就是说，MCP 发布最终要落成：

- 明确的 `user_id`
- 或明确的 `team_id`

而不是只依赖 session 中的“当前激活组织/团队”。

## 2.4 扩展：`registry_api_key_policies`

当前关键字段：

- `owner_user_id`

推荐新增：

- `owner_team_id` `text | uuid` nullable references Better Auth `team.id`

MVP 语义：

- 个人 token policy：归属某个 user
- 团队 token policy：归属某个 team

建议约束：

- `num_nonnulls(owner_user_id, owner_team_id) = 1`

备注：

- 这会是后面 team token / MCP scope 的关键基础
- 即使第一版不开放团队 token UI，这个设计方向也值得先定下来

---

## 三、第一阶段暂不修改的表

以下表建议第一阶段先不动结构，只在使用时通过 item / collection 间接感知 team：

### `registry_files`

- 跟随 `registry_items`
- 无需单独加 team 字段

### `registry_item_versions`

- 跟随 `registry_items`
- 无需单独加 team 字段
- `created_by` 继续保留 user/tool 语义

### `registry_file_versions`

- 跟随 `registry_item_versions`

### `registry_asset_jobs`

- 跟随 `item_id`
- 无需单独加 team 字段

---

## 四、团队 token 的两种建模路径

团队 token 迟早要支持，但 MVP 可以分阶段。

## 方案 A：继续复用现有 `apikey`

当前 `apikey.reference_id` 很像是“持有者主体 id”，但语义偏 user。

如果继续复用，建议后续补两个字段：

- `subject_type` = `user | team`
- `subject_id`

然后逐步把 `reference_id` 退成兼容字段。

优点：

- 复用现有 token 链路

缺点：

- 迁移语义会有点别扭

## 方案 B：MVP 先不做 team token

第一阶段只做：

- team-owned resources
- team collections
- team-scoped UI and MCP reads

第二阶段再把 token 统一抽象。

优点：

- 范围清晰
- 不会把 OAuth / MCP 权限也同时改太大

我的建议：

- **MVP 先走方案 B**
- 等 team scope 和 UI 跑顺之后，再补 team token 设计

---

## 五、推荐的数据库约束

为了避免双归属或脏数据，建议最终加这些 check constraint：

### `registry_items`

- 个人和 team 归属必须二选一

### `registry_collections`

- `owner_user_id` 和 `owner_team_id` 必须二选一

### `registry_api_key_policies`

- `owner_user_id` 和 `owner_team_id` 必须二选一

organization / team 的成员角色与邀请状态由 Better Auth organization plugin 自己负责建模和约束。

这些约束不一定都要在第一版 migration 就写死，但逻辑上应当先在设计稿里定住。

---

## 六、应用层 scope 读取建议

虽然数据库先走双字段，但应用层最好尽早统一成 scope 对象。

建议统一输出成类似：

```ts
type RegistryScopeRef =
  | { kind: "personal"; userId: string }
  | { kind: "team"; teamId: string };
```

例如：

- `registry_items` 读出来后映射成 `scope`
- `registry_collections` 读出来后映射成 `scope`

这样后续：

- UI scope switcher
- permission checks
- MCP filtering
- install / preview / thumbnails

都不需要继续分散依赖“到底是 userId 还是 teamId”。

organization 在应用层更多是：

- 顶层容器
- 当前用户所属边界
- team 列表的来源

而不是 registry 业务资源的直接归属对象。

---

## 七、查询与唯一性策略

## 7.1 名称唯一性

当前个人资源已经有：

- `unique(user_id, name)`

团队资源建议新增：

- `unique(team_id, name)`

这意味着：

- 同名资源可以分别存在于：
  - 某个用户
  - 某个 team

这符合 scope 语义。

## 7.2 Collection slug 唯一性

当前个人 collection 已有：

- `unique(owner_user_id, slug)`

团队 collection 建议新增：

- `unique(owner_team_id, slug)`

## 7.3 UI 查询建议

列表查询建议统一支持：

- personal scope
- team scope
- mixed view（后续）

但第一阶段 UI 不需要“混合列表”，只需要：

- 当前 scope 内列表

---

## 八、MVP 对现有代码的影响范围

如果按这套模型推进，第一阶段主要会影响：

### auth / organization integration

- 接入 Better Auth organization plugin
- 启用 Better Auth 的 team 能力
- 定义 Cozy 的角色映射：`owner / editor / viewer`
- 明确 active organization / active team 的读取方式

### schema / migrations

- 给 `registry_items` 加 `team_id`
- 给 `registry_collections` 加 `owner_team_id`
- 给 `registry_api_key_policies` 加 `owner_team_id`

### registry queries

- 列表
- 按 owner/name 查询
- 创建 item
- 创建 collection
- 权限判断

### app UI

- scope switcher
- team dashboard
- team collections
- team settings

### MCP / API

- 允许按 team scope 获取资源
- 后续按 team/collection 限定 AI 范围

---

## 九、推荐的第一版 migration 顺序

为了降低风险，建议顺序如下：

### Migration 1

- 接入 Better Auth organization plugin
- 启用 Better Auth team
- 让 Better Auth 生成 / 管理 organization + team 相关表

### Migration 2

- `registry_items` 增加 `team_id`
- `registry_collections` 增加 `owner_team_id`
- `registry_api_key_policies` 增加 `owner_team_id`

### Migration 3

- 增加唯一键和索引
- 视情况加入 check constraints

应用层可以先在没有 check constraint 的情况下迭代，等逻辑稳定后再收紧约束。

---

## 十、当前推荐结论

基于当前代码库，MVP 最合适的数据表设计不是“一步到位做 scopes 表”，而是：

1. 复用 Better Auth `organization`
2. 复用 Better Auth `team`
3. 在 Cozy 的业务归属表上增加 `team_id / owner_team_id`
4. 在应用层统一抽象成 scope

这样做的好处是：

- 对现有代码侵入最小
- 足够支撑 team dashboard / collections / settings
- 不会阻断后续 team token / MCP scope 扩展
- 避免自己重复维护 organization / team / membership 表

---

## 十一、实现状态快照（2026-03-27）

下列条目用于与本文设计对照；代码路径以仓库当前状态为准。

| 设计点 | 状态 | 备注 |
|--------|------|------|
| Better Auth organization plugin + teams | 已落地 | `lib/auth.ts`；Drizzle 中 `organization`、`member`、`team`、`teamMember`、`invitation`；`session.activeOrganizationId` / `activeTeamId` |
| `registry_items.team_id` 与个人 `user_id` 互斥 | 已落地 | 创建与校验见 `lib/registry.ts` |
| `registry_collections.owner_team_id` 与 `owner_user_id` 互斥 | 已落地 | Collections API 按 `getCollectionScopeContext` 区分 scope |
| `registry_api_key_policies.owner_team_id` | 已落地 | Team scope 下 Settings 策略与 API；**密钥仍绑定用户**，非独立 team 主体 `apikey` |
| MCP publish 显式 `teamId` + 可选 session fallback | 已落地 | `app/api/registry/items/route.ts`；MCP 工具侧要求显式 `teamId` 的表述见 `lib/mcp-tools.ts` |
| DB `CHECK` 约束（`num_nonnulls`） | 未强制依赖 | 逻辑在应用层；迁移中视情况收紧 |
| 三段式 ref `@orgSlug/teamSlug/item` 与统一 resolver | **已落地（读取/安装/MCP）** | `parseRegistryDependencyRef` 支持三段式；`getRegistryItemByOwnerNameAndVersion` 的 `owner` 支持 `orgSlug/teamSlug`；`/api/r/{org}/{team}/{name}` 与 install-protocol；预览见 `/preview/{org}/{team}/{name}` |
| 方案 B「MVP 不做 team token」 | **已演进** | 当前为「用户 API key + `owner_team_id` policy」承载 team 侧 MCP 策略；独立 `subject_type = team` 的 token 仍属后续 |

与产品路线图 Phase A–D 的对照见 [team-workspaces-plan.md](../10-product/team-workspaces-plan.md)（文档 §「实现状态与长期路线图对照」）。

---

## 一句话总结

**MVP 团队数据模型建议采用“复用 Better Auth organization + team，业务表增量添加 `team_id`，应用层统一成 scope”的方案。**

这比现在就做通用 scope 表、或者自己重复发明 organization/team/member 身份模型，都更稳，也更适合 Cozy Registry 当前的演进阶段。

Status: in progress
Owner: engineering
Last updated: 2026-03-29
Source of truth: no

# Project Model Simplification Spec

## 目的

这份 spec 定义 Cozy Registry 从：

- `organization`
- `team`
- `collection`

逐步收敛到：

- `organization`
- `project`

的目标模型与迁移路径。

核心目标不是一次性删除所有 team 相关实现，而是完成三件事：

1. 把 `collection` 升级为正式的 `project`
2. 把 access control 从 `team` 下沉到 `project`
3. 把 `team` 从产品主层级降级为兼容层，最终可删除

---

## 一、结论

未来建议以 `project` 作为 Cozy 的一等工作单元。

推荐的长期公开模型是：

- `organization`
- `project`
- `project_member`
- `project_role`

其中：

- `organization` 负责成员池、顶层治理、账单和安全边界
- `project` 负责协作、权限、资源归属和工作上下文
- `team` 不再作为长期产品主模型继续投资

---

## 二、为什么要做

当前的 `org -> team -> collection` 模型有几个问题：

1. 用户心智偏重
   用户真正关心的通常是“我在哪个组织”和“我在做哪个项目”，而不是先进入 team 再找 collection。

2. 权限边界不够直接
   如果资源和协作最终都围绕 project 展开，继续把 team 放在 project 前面会让权限判断和 scope 切换变复杂。

3. 路由与 API 语义会持续变长
   继续沿着 `team` 扩展，会固化 `/t/:orgSlug/:teamSlug/...` 这种路径，也会让 publish target、registry owner、settings scope 更绕。

4. `collection` 的产品语义已经偏弱
   如果 collection 承担的是协作边界、资源边界和设置边界，它实际上已经更接近 `project`。

---

## 三、目标模型

### 3.1 顶层实体

#### Organization

表示：

- 公司
- 工作室
- 顶层成员池

职责：

- 管理成员总归属
- 提供项目所属的顶层命名空间
- 承载账单、顶层治理和安全边界

#### Project

表示：

- 实际协作空间
- 权限边界
- 资源归属边界

职责：

- 拥有成员和角色
- 拥有 registry items 与 project settings
- 作为 publish / preview / MCP / notifications 的主要上下文

### 3.2 支持的项目类型

建议支持：

- personal project
- organization project

约束：

- 一个 project 要么属于个人，要么属于 organization
- 不需要再引入 `team owns project` 的中间层

---

## 四、数据模型建议

### 4.1 核心表

建议最终目标表如下。

#### `projects`

- `id`
- `slug`
- `name`
- `description`
- `visibility`
- `organization_id` nullable
- `owner_user_id` nullable
- `created_at`
- `updated_at`

建议约束：

- `organization_id` 和 `owner_user_id` 二选一
- slug 在其所属命名空间内唯一

#### `project_members`

- `id`
- `project_id`
- `user_id`
- `role`
- `created_at`

#### `project_invitations`

- `id`
- `project_id`
- `email`
- `role`
- `status`
- `expires_at`
- `created_at`

### 4.2 现有表的迁移方向

当前实现已经进入第一轮真实迁移：

- `projects` / `project_items` 已经有独立表
- `project-service`、`project-membership-service`、`project-access-service` 已切到新表
- `/projects*` 已经不再只是 facade remap
- `/collections*` 现在是兼容 alias，仍可用但不再是主路径

建议现有 `registry_collections` 作为 `projects` 的主要迁移起点。

映射关系建议如下：

- `registry_collections` -> `projects`
- `registry_collection_items` -> `project_items` 或保留 item 关联表语义
- `team collaboration` -> `project membership`

兼容阶段不要求立刻物理删除旧表，但新 service 和新 API 不应继续强化 collection/team 语义。

---

## 五、权限模型建议

权限判断应改为 project-first，而不是 team-first。

### 5.1 角色

MVP 先保留三档：

- `owner`
- `editor`
- `viewer`

### 5.2 权限能力

建议 project 层能力至少包括：

- `project:read`
- `project:write`
- `project:publish`
- `project:manage_members`
- `project:manage_settings`

### 5.3 判断原则

后续任何权限判断都优先表达成：

- “当前用户对这个 project 的角色是什么”

而不是：

- “当前用户在这个 team 里的角色是什么，再推导它对 collection/project 的权限”

---

## 六、资源归属建议

未来这些资源都应逐步 project 化：

- registry items
- publish targets
- preview context
- project settings
- notifications scope
- API policy scope
- member management

关键原则：

- 只要资源仍然主要归属于 `team`，team 就很难退出主模型
- 所有新能力都不应继续增加新的 team-owned 语义

---

## 七、URL 与 API 建议

### 7.1 Web 路由

建议未来主路径是：

- `/projects`
- `/projects/:projectSlug`
- `/projects/:projectSlug/settings`
- `/projects/:projectSlug/members`

如果必须带 organization 语义：

- `/orgs/:orgSlug/projects/:projectSlug`

不建议继续把 `team` 固化在长期主路径里，例如：

- `/t/:orgSlug/:teamSlug/...`

兼容阶段建议：

- `/collections` 作为 `/projects` 的 alias
- `/t/:orgSlug/:teamSlug/collections` 作为 `/t/:orgSlug/:teamSlug/projects` 的 alias
- 所有新入口、新按钮和新导航一律只展示 `projects`

### 7.2 Platform API

建议逐步新增 project-first API：

- `GET /projects`
- `POST /projects`
- `GET /projects/:projectId`
- `PATCH /projects/:projectId`
- `DELETE /projects/:projectId`

- `GET /projects/:projectId/members`
- `POST /projects/:projectId/members`
- `PATCH /projects/:projectId/members/:memberId`
- `DELETE /projects/:projectId/members/:memberId`

兼容期保留：

- `/collections`
- `/collections/:id`
- `/team/current/collaboration`

但它们应逐步退化为 compatibility adapter 或 alias。

---

## 八、与现有代码的映射

第一批最值得演进的现有模块：

- `@cozy/platform-services/collections-service`
- `apps/web` 中所有 collections 页面与导航
- `@cozy/auth-control` 中 current team collaboration 相关逻辑
- `@cozy/registry-domain` 中 publish target / owner 语义

推荐做法：

1. 新增 `project-service`
2. 让 `collections-service` 在兼容期内部转调 `project-service`
3. Web 新入口优先使用 `/projects`
4. 旧 `/collections` 页面先保留兼容跳转或 alias

---

## 九、team 的未来定位

team 建议只保留两种可能：

1. compatibility layer
   用于旧数据、旧 URL、旧 API 过渡

2. internal access group
   如果未来确认确实需要“同一组成员复用于多个 project”，可以把 team 退化成内部权限组，而不是产品主层级

不建议继续把 `team` 作为长期公开产品模型继续扩展。

---

## 十、迁移阶段建议

### Phase A: 语义切换

目标：

- UI、文档、导航开始使用 `project` 术语
- 新能力不再继续扩 `collection/team` 心智

动作：

- 把 Web 文案中的 `Collection` 改成 `Project`
- 新入口优先走 `/projects`
- 新 spec 与新实现统一使用 `project` 命名

### Phase B: Service 层切换

目标：

- 建立 `project-service`
- 新业务逻辑 project-first

动作：

- 新增 `@cozy/platform-services/project-service`
- `collections-service` 兼容转调
- 新 API 优先暴露 `/projects`

### Phase C: 权限切换

目标：

- 访问控制切到 project-first

动作：

- 引入 project-level permission helpers
- 新成员管理以 `project_members` 为中心建模
- team collaboration 逐步退为兼容视图

### Phase D: 资源归属切换

目标：

- 主要资源 project 化

优先顺序建议：

1. projects 本体
2. registry publish target
3. project settings
4. notifications scope
5. API key / policy scope
6. preview scope

### Phase E: 数据与公开模型清理

目标：

- 物理 rename
- 删除多余公开 team 语义

动作：

- `collections` 表和 API 最终重命名
- 公开 team 路由与 team 页面删除
- team 仅保留为内部实现或完全移除

---

## 十一、非目标

本次简化不要求在第一阶段完成以下事项：

- 一次性删除所有 team 数据
- 立即重写所有 Better Auth organization/team 能力
- 立刻把所有旧 URL 全部切走
- 在同一轮改造里完成数据库物理 rename + UI 全量重构 + registry owner 全量切换

这些动作都应分阶段进行。

---

## 十二、第一批执行清单

建议先落以下 6 项：

1. 新建 `project-service`，复用现有 collections 逻辑
2. Web 引入 `/projects` 路由和页面入口
3. 把 collections UI 文案改成 project
4. 明确 project-level permission helper 设计
5. 为 registry publish target 增加 project 归属方向
6. 把 team 相关文档标记为 MVP/兼容模型，而不是长期目标模型

---

## 十三、与现有 team 文档的关系

这份 spec 不会立即废弃以下文档：

- [team-data-model.md](./team-data-model.md)
- [team-permission-matrix.md](./team-permission-matrix.md)
- [team-publish-target-spec.md](./team-publish-target-spec.md)

但它定义了更长期的目标方向：

- 这些 team 文档描述的是当前或过渡模型
- 本文描述的是下一阶段目标模型

如果后续开始实现 `project-service` 和 `/projects`，应优先以本文作为方向性约束。

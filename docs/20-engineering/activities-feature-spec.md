Status: proposed
Owner: product + engineering
Last updated: 2026-04-10
Source of truth: no

# Activities Feature Spec

## 1. 背景

当前系统已经有：

- workspace scope
- project switcher
- canonical project item
- project-scoped identity
- 资源生命周期（create / update / archive / delete）

但还缺一层统一的 **活动流（activities）**，让用户看到：

- 在当前组织 / 个人 scope 内最近发生了什么
- 在某个 project 内最近哪些资源被创建、更新、归档、删除
- 谁在什么时候做了什么

这个能力现在就可以在组织场景中启用，不需要等所有长期模型都完全收口。

## 2. 目标

做一个按当前 context 自动收缩范围的 activities 功能。

用户应能：

1. 在组织或个人 scope 中查看该 scope 下所有相关资源的活动记录
2. 在 project 内查看该 project 相关的活动记录
3. 理解活动涉及：
   - 哪个资源
   - 做了什么操作
   - 由谁触发
   - 发生在什么时候

## 3. 非目标

本阶段不做：

- 细粒度 field diff UI
- 完整审计合规系统
- 所有页面的实时 live feed
- 跨应用真实页面 usage timeline

本阶段重点是：

- 资源活动记录
- context-aware 列表入口
- 清晰的范围与事件模型

## 4. 核心产品决策

### 4.1 Activities 现在就可在组织中启用

该功能不需要等公开市场、完整 publication unit、或全局 audit platform 成熟。

第一阶段支持：

- personal scope activities
- organization / workspace scope activities
- project-scoped activities

### 4.2 Activities 的范围由当前页面 context 决定

sidebar 入口必须感知当前 context：

- 在 project detail / project settings 内：
  - `Activities` 表示 **当前 project 的活动**
- 在 workspace 根页 / workspace items / workspace settings 外层：
  - `Activities` 表示 **当前 workspace 的活动**
- 在 personal `/me` 相关页面：
  - `Activities` 表示 **当前个人 scope 的活动**

换句话说：

- **page context 是 source of truth**
- sidebar 入口只派生当前 activities 范围

### 4.3 Activities 先按“资源事件流”建模

第一阶段活动内容包括资源的：

- create
- publish version
- update metadata
- archive
- delete

可选纳入但不要求第一天就做：

- restore / unarchive
- move / copy to another owner or project
- theme relationship change
- project default theme change

## 5. 为什么需要单独建活动流

当前虽然已有：

- `createdAt`
- `updatedAt`
- `archivedAt`
- `deletedAt`
- versions

但这些只是分散状态，不是统一活动模型。

它们缺少：

- actor
- event type
- scope projection
- resource snapshot / label
- 一致的列表读取方式

所以 activities 不应只是把若干 timestamp 拼起来，而应成为正式事件流。

## 6. 用户可见形态

### 6.1 Sidebar 入口

建议在现有 sidebar 一级导航中加入：

- `Activities`

入口行为：

- workspace shell 中：
  - `/workspace/{slug}/activities`
- personal shell 中：
  - `/me/activities`
- project detail 内：
  - `/workspace/{slug}/projects/{projectId}/activities`
  - 或 `/me/projects/{projectId}/activities`

### 6.2 页面标题与副标题

根据 context 自动变化：

- `Workspace activity`
- `Project activity`
- `Personal activity`

副标题显示范围来源，例如：

- `Showing recent activity for Acme workspace`
- `Showing recent activity for project “Design System”`

### 6.3 列表项结构

每条 activity 至少显示：

- actor
- action verb
- resource title
- resource type
- timestamp
- context badge

示例：

- `Chen published v0.3.0 of Button`
- `Mina updated Hero metadata`
- `Chen archived Card`
- `AI Agent updated theme layers for Dialog`

## 7. 事件模型

建议新增正式表，例如：

- `registry_activities`

推荐字段：

- `id`
- `organizationId` nullable
- `ownerUserId` nullable
- `projectId` nullable
- `projectKey` nullable
- `itemId` nullable
- `itemVersionId` nullable
- `actorUserId` nullable
- `actorType`
  - `user`
  - `agent`
  - `system`
- `eventType`
- `resourceType`
  - `registry:block`
  - `registry:ui`
  - `registry:theme`
  - `registry:project`
- `resourceName`
- `resourceTitle`
- `metadata` jsonb
- `createdAt`

### 7.1 推荐 event types

第一阶段：

- `item.created`
- `item.version_published`
- `item.metadata_updated`
- `item.archived`
- `item.deleted`

第二阶段可扩：

- `item.restored`
- `item.moved`
- `item.copied`
- `theme.relationship_updated`
- `project.theme_defaults_updated`

## 8. 范围模型

### 8.1 Workspace activities

读取条件：

- 当前 organization scope 下的活动

包括：

- 该 organization 拥有的 item 活动
- 该 organization 下 project 相关活动

### 8.2 Personal activities

读取条件：

- 当前 user 作为 owner scope 的活动

### 8.3 Project activities

读取条件：

- `projectId = current project`

包括：

- canonical project item 的资源活动
- project-level theme / setting 变化（后续）

### 8.4 Canonical project item 是唯一 project 归属语义

这一点要明确：

- activities 不应再保留 “attach to project” 和 “canonical project item” 双重语义
- project-scoped activities 的判断只认 **canonical project**

建议规则：

- 如果 item 的 canonical project 是该 project：
  - item create / publish / metadata update / archive / delete 都属于该 project activity
- 如果 item 不属于该 project：
  - 不应因为历史 attach 概念而出现在该 project activity 中

这样可以避免再次出现 UI 看起来在 project 中、但系统语义不一致的问题。

## 9. 事件写入时机

### 9.1 Item create

在 publish 新 item 成功后写入：

- `item.created`

### 9.2 Version publish

每次新版本写入成功后写入：

- `item.version_published`

### 9.3 Metadata update

当 title / description / meta / visibility / preview props 等发生更新时写入：

- `item.metadata_updated`

### 9.4 Lifecycle actions

archive / delete / restore 时写入：

- `item.archived`
- `item.deleted`
- `item.restored`

### 9.5 Project relationship changes

第一阶段不单独建 attach / detach 事件。

原因：

- 当前主模型已经收口到 canonical project item
- activities 应直接反映 canonical project 下资源本身的生命周期
- 不再为历史 attach 语义继续扩展新的事件类型

## 10. Context-aware navigation contract

sidebar 的 `Activities` 链接应按当前 context 派生：

### 10.1 Workspace shell

- 在 `/workspace/{slug}` 及其非 project 子页面
- 一级导航链接到：
  - `/workspace/{slug}/activities`

### 10.2 Personal shell

- 在 `/me` 及其非 project 子页面
- 一级导航链接到：
  - `/me/activities`

### 10.3 Project detail / project settings

- 在 `/workspace/{slug}/projects/{projectId}` 或 `/me/projects/{projectId}`
- 一级导航链接到：
  - project-scoped activities 页面

也就是说：

- 不是再加一个 project switcher inside activities
- 而是让入口自然继承当前 sidebar context

## 11. API contract

建议增加统一接口，例如：

- `GET /api/activities`

查询参数：

- `scopeType = personal | organization | project`
- `organizationSlug?`
- `projectId?`
- `cursor?`
- `limit?`
- `types?`

也可拆为：

- `/api/me/activities`
- `/api/workspace/{slug}/activities`
- `/api/projects/{id}/activities`

但内部仍建议共用同一 service。

## 12. 推荐读取顺序

### Phase 1

先做最稳定的一版：

- item create
- version publish
- metadata update
- archive
- delete

只读最近活动，不做复杂过滤。

### Phase 2

加入：

- metadata update
- event type filter
- actor filter
- resource type filter

### Phase 3

再加入：

- project theme defaults changes
- theme relationship changes
- richer diff summary

## 13. 数据回填策略

既然当前仍在开发阶段，不建议为了历史兼容做复杂回填。

建议：

- activities 表从新事件开始正式写入
- 历史活动不强制完整补齐
- 如需初始可见性，可只用已有时间戳生成极少量 synthetic seed events

也就是说：

- **now-forward correctness > deep legacy backfill**

## 14. 未来扩展

activities 后续可以成为更多能力的基础：

- project changelog
- publish feed
- team review feed
- AI-generated summary
- usage / adoption timeline

但第一阶段不要把它做成“大审计平台”。

## 15. 建议开发顺序

1. 定义 `registry_activities` schema
2. 在 publish / update / archive / delete 写入事件
3. 做 unified activities service
4. 做三类页面：
   - personal activities
   - workspace activities
   - project activities
5. 接 sidebar context-aware 入口
6. 再补 event filters 和 richer metadata

## 16. 一句话总结

Activities 应被设计成一个 **按当前 context 自动收缩范围的资源事件流**：

- 在 project 内看 project activity
- 在 workspace 外层看 workspace activity
- 在 personal 下看 personal activity

第一阶段先覆盖 canonical project item 的增删改查与版本发布，不把它做成复杂 audit 系统。

---

## 17. 数据库 schema 草案

以下与现有 Drizzle + Postgres 风格对齐；表名可按团队惯例微调（例如 `registry_activities` vs `activities`）。

### 17.1 表：`registry_activities`

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, default random | |
| `created_at` | `timestamp` | not null, default now | 事件发生时间（排序主键） |
| `organization_id` | `text` | FK → `organization.id`, nullable | workspace scope；个人 owner scope 可为 null |
| `owner_user_id` | `text` | FK → `user.id`, nullable | 个人 catalog 或「归属用户」侧写；与 org 互斥或并存按写入规则定 |
| `canonical_project_id` | `uuid` | FK → `registry_projects.id`, nullable | 与现有 canonical project 语义一致 |
| `item_id` | `uuid` | FK → `registry_items.id`, nullable, onDelete set null | 资源删除后保留行但断开强引用 |
| `item_version_id` | `uuid` | FK → `registry_item_versions.id`, nullable, onDelete set null | 版本发布类事件 |
| `actor_user_id` | `text` | FK → `user.id`, nullable | 人为操作 |
| `actor_type` | `text` | not null | `user` \| `agent` \| `system` |
| `event_type` | `text` | not null | 见 §7.1 |
| `resource_type` | `text` | not null | 与 `registry_items.type` 对齐，如 `registry:ui`、`registry:block`、`registry:theme`；project 级事件可用 `registry:project` |
| `resource_name` | `text` | not null | slug，如 `button` |
| `resource_title` | `text` | nullable | 展示用标题快照 |
| `resource_owner_ref` | `text` | nullable | 便于列表展示 `@handle/name`，写入时快照 |
| `version_label` | `text` | nullable | 如 `0.3.0`，仅版本相关事件 |
| `metadata` | `jsonb` | not null, default `{}` | 扩展字段：变更字段列表、旧值摘要、request id 等 |
| `correlation_id` | `text` | nullable | 同一请求多事件可选共用 |

**索引（建议）**

- `(organization_id, created_at desc, id desc)` — workspace 列表 + cursor
- `(owner_user_id, created_at desc, id desc)` — personal 列表 + cursor
- `(canonical_project_id, created_at desc, id desc)` — project 列表 + cursor
- `(item_id, created_at desc)` — 单资源时间线（二期）
- 可选：`(event_type)` 或 `(resource_type)` 若过滤为主且数据量大再 partial index

**写入不变量（实现时 enforce）**

- `event_type` 与 `item_id` / `item_version_id` 可空性一致（如 `item.version_published` 应有 `item_version_id`）。
- Project scope 行：`canonical_project_id` 必须非 null；workspace 行：至少 `organization_id` 或可追溯至 org 的 item。
- 与 §8.4 一致：仅当 item 的 canonical project 命中时，才写入 `canonical_project_id = 该项目` 的 project activity。

### 17.2 `metadata` 示例（JSON，非强制 schema）

```json
{
  "changedFields": ["title", "visibility"],
  "previousTitle": "Old",
  "source": "api",
  "client": "web"
}
```

---

## 18. API shape

### 18.1 对外：统一只读列表

**`GET /api/activities`**

鉴权：session；按参数解析 scope 并校验当前用户是否有权读该 scope（与现有 workspace / project / me 路由一致）。

**Query**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `scope` | `personal` \| `organization` \| `project` | 是 | |
| `organizationSlug` | string | `organization` 时必填 | 与 `/workspace/{slug}` 一致 |
| `projectId` | uuid | `project` 时必填 | registry project id |
| `cursor` | string | 否 | opaque，默认 `createdAt,id` 游标 base64url |
| `limit` | number | 否 | 默认 `30`，最大 `100` |
| `eventTypes` | string | 否 | 逗号分隔，如 `item.created,item.version_published` |

**Response 200**

```json
{
  "scope": {
    "type": "organization",
    "organizationId": "…",
    "label": "Acme"
  },
  "items": [
    {
      "id": "uuid",
      "createdAt": "2026-04-10T12:00:00.000Z",
      "eventType": "item.version_published",
      "actor": {
        "type": "user",
        "userId": "…",
        "displayName": "Chen",
        "handle": "chen"
      },
      "resource": {
        "type": "registry:ui",
        "name": "button",
        "title": "Button",
        "ownerRef": "acme",
        "href": "/registry/acme/button"
      },
      "version": "0.3.0",
      "metadata": {}
    }
  ],
  "nextCursor": "string-or-null",
  "hasMore": true
}
```

**错误**

- `400` — 参数缺失或 scope 组合非法
- `401` — 未登录
- `403` — 无该 org/project 读权限
- `404` — org/project 不存在

### 18.2 内部：单一 service

例如 `listActivities({ scope, organizationId?, ownerUserId?, projectId?, cursor, limit, eventTypes })`，由 `GET /api/activities` 与（若存在）RSC `loadActivities` 共用。

### 18.3 与拆分路由的关系（可选）

若产品希望 URL 与 API 一一对应，可增加薄封装：

- `GET /api/me/activities` → 固定 `scope=personal`
- `GET /api/workspace/[slug]/activities` → 固定 `scope=organization`
- `GET /api/projects/[projectId]/activities` → 固定 `scope=project`

内部仍调用同一 `listActivities`。

---

## 19. Sidebar 具体改动点

实现入口集中在 **`app/(auth)/AppShell.tsx`**（当前一级导航由 `buildSidebarNavItems` 生成）。

### 19.1 新增导航项

- 在 **`buildSidebarNavItems`** 返回数组中，于 `Overview` 与 `Settings` 之间（或 `Items` 之后，与产品偏好一致）增加一项：
  - **key**: `activities`
  - **label**: `Activity`（与下方文案 §20 一致；若需复数统一为 `Activity` 作栏目名）
  - **icon**: `Activity` 或 `History`（自 `lucide-react`）
  - **href**: 由新函数 **`activitiesHref(context)`** 计算，与 `projectScopedHref` 并列：

| Context | `href` |
| --- | --- |
| workspace shell，无选中 project | `/workspace/{slug}/activities` |
| workspace shell，有 `selectedProjectId` | `/workspace/{slug}/projects/{projectId}/activities` |
| personal shell，无 project | `/me/activities` |
| personal shell，有 project | `/me/projects/{projectId}/activities` |

`SidebarContext`（或等价参数）需传入 `activitiesHref` 所需字段；可在 `AppShellFrame` 内与 `overviewHref` / `settingsHref` 同步计算。

### 19.2 高亮规则：`navActive`

在 **`navActive(pathname, href)`** 中增加专用分支（须在泛化 `path.startsWith` 之前），避免与 `/workspace/{slug}` items 根冲突：

- `/me/activities`：pathname 等于或以其为前缀（若未来有子路径）
- `/workspace/{slug}/activities`：同上
- `/me/projects/{id}/activities`、`/workspace/{slug}/projects/{id}/activities`：建议 **精确匹配** 该段 + 可选子路径，**不要** 与 `/projects/{id}/settings` 互抢 active

### 19.3 路由与页面文件（实现清单）

- `app/(auth)/me/activities/page.tsx`
- `app/(auth)/workspace/[slug]/activities/page.tsx`
- `app/(auth)/me/projects/[projectId]/activities/page.tsx`
- `app/(auth)/workspace/[slug]/projects/[projectId]/activities/page.tsx`

页面内调用同一列表组件 + `GET /api/activities`（或 Server Component 直接调 service）。

### 19.4 不需改动（除非要做 mobile nav）

- `ProjectSwitcher` / `WorkspaceScopeSwitcher`：保持现状；activities 范围随当前 URL 与 sidebar 继承，**不在 Activity 页内再嵌 project switcher**（与 §10 一致）。

---

## 20. 首批 UI 文案（英文，可与产品再定中文）

### 20.1 页面标题 / 副标题

| Scope | 标题 | 副标题模板 |
| --- | --- | --- |
| Workspace | Workspace activity | Showing recent activity for **{workspaceName}**. |
| Project | Project activity | Showing recent activity for project **{projectTitle}**. |
| Personal | Personal activity | Showing recent activity for your items. |

### 20.2 空状态

- **标题**: Nothing here yet
- **正文**: When you or your team create, publish, or update items, those events will show up here.
- **次要说明**（可选）: Older changes may not appear; activity is recorded from when this feature went live.

### 20.3 加载与错误

- **加载**: Loading activity…
- **加载失败**: Couldn’t load activity. **Retry**（按钮）
- **无权限**（若前端可区分）: You don’t have access to this activity feed.

### 20.4 `eventType` → 动词模板（用于生成句子）

用于单行主文案（可与 actor、资源名组合）：

| `eventType` | 模板（`{actor}` `{resource}` `{version}`） |
| --- | --- |
| `item.created` | {actor} created {resource} |
| `item.version_published` | {actor} published {version} of {resource} |
| `item.metadata_updated` | {actor} updated details for {resource} |
| `item.archived` | {actor} archived {resource} |
| `item.deleted` | {actor} deleted {resource} |

`{resource}` 默认：`{title}` 或 `{name}`；列表可加类型小标签（见下）。

### 20.5 Context badge（列表项角标）

| Scope 来源 | Badge 文案 |
| --- | --- |
| 当前为 project 视图 | This project |
| 当前为 workspace 视图、事件属某 project | In **{projectTitle}** |
| 个人 scope | （可不显示或显示 **Personal**） |

---

## 21. Event row 设计（首批）

### 21.1 布局（桌面 / 移动端同一结构）

单行列表项，**左时间轴感可选（二期）**；一期用扁平列表即可。

```
┌─────────────────────────────────────────────────────────────┐
│ [可选头像]  Primary line (sentence)                    badge   │
│            Secondary: type · @owner/name · relative time      │
└─────────────────────────────────────────────────────────────┘
```

- **Primary line**：§20.4 模板生成，例如 `Chen published v0.3.0 of Button`
- **Secondary line**：`registry:ui`（可读标签 **UI**）· `@acme/button` · `2h ago`
- **右侧 badge**：§20.5；无则省略
- **可选尾部 chevron**：若整行可点击跳转 registry 详情则显示

### 21.2 类型标签（resource type → 短标签）

| `resource_type` | 标签 |
| --- | --- |
| `registry:ui` | UI |
| `registry:block` | Block |
| `registry:theme` | Theme |
| `registry:project` | Project |

### 21.3 Actor 展示

- `actor_type === user`：显示 `displayName`，无则 `handle`，无则 `You`（若 `actor_user_id === currentUserId`）
- `system`：**Cozy** 或 **System**
- `agent`：**AI agent** 或 metadata 内 `agentName`

### 21.4 时间

- 列表内：**relative**（`2h ago`），tooltip 或 secondary 展开为绝对时间
- 跨天：可切换为日期 `Apr 10, 2026`

### 21.5 可访问性

- 每一行：`article` 或 `li` + `aria-labelledby` 指向主文案
- 时间使用 `<time datetime="…">`

### 21.6 一期不做的交互

- 行内展开 diff、筛选器 UI（仅 API 预留 `eventTypes` 即可）
- 无限滚动可二期；一期 **Load more** + `nextCursor` 足够

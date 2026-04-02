Status: proposed
Owner: engineering
Last updated: 2026-04-02
Source of truth: yes

# Registry Resource Lifecycle Spec

本文定义 Cozy Registry 中资源的两类生命周期操作：

- 删除（delete / archive）
- 归属移动（move ownership / transfer）

目标不是“把一条数据库记录删掉或改 owner”，而是在不破坏 canonical ref、依赖图、历史版本可复现性和 preview artifact 的前提下，安全地管理资源生命周期。

## 1. Problem Statement

当前 registry item 的外部身份已经深度绑定在 `@owner/name` 上，并且该 ref 已进入：

- `registryDependencies`
- preview / API URL
- install protocol headers / provenance
- MCP / Web / future CLI contracts

因此：

- 删除不能只看当前 item 行是否存在
- 移动不能被建模为简单的 `userId -> organizationId` 原地更新

`@owner/name` 是标识符，不只是展示属性。

## 2. Goals

- 为普通用户提供安全、可解释的删除与移动能力
- 保持历史版本、依赖解析和 preview 的稳定性
- 支持个人资产沉淀到组织空间
- 为后续 alias、redirect、dependency migration 留出空间

## 3. Non-Goals (v1)

以下能力不属于 v1：

- 自动重写 inbound `registryDependencies`
- lockfile / installed project 的自动迁移
- move with history merge
- cross-org batch migration
- 彻底清理所有历史 bytes / artifacts
- alias / redirect 的完整用户体验

## 4. Current State

当前系统已经具备：

- 基于 referrer 查询的删除前依赖拦截
- 用户 owner 与 organization owner 的分别删除入口
- item / version / preview artifact 的稳定读取路径

当前系统尚未具备：

- 软删除 / archive 状态模型
- 移动关系（move lineage）模型
- ownership transfer 的显式 API
- 迁移后的 alias / redirect / advisory migration

## 5. Design Principles

### 5.1 Archive-first, not hard-delete-first

默认删除动作应从产品表面移除，而不是立即物理删除所有历史记录。

### 5.2 Move is identity migration, not owner mutation

把个人资源移动到组织，不是“改 owner 字段”，而是“创建新的 canonical ref，并保留迁移关系”。

### 5.3 Historical reproducibility wins

只要历史版本仍可能被 preview、resolver 或已安装项目依赖，就不应因为生命周期操作而失去可解析性。

### 5.4 Do not silently rewrite downstream consumers

别的 item、项目或 agent 依赖了旧 ref 时，系统不应默默改写它们的依赖边。

## 6. Deletion Model

### 6.1 States

v1 推荐把 item 生命周期建模为：

- `active`
- `archived`
- `deleted`

建议字段：

- `status`
- `archivedAt`
- `archivedBy`
- `deletedAt`
- `deletedBy`
- `lifecycleReason`（可选）

### 6.2 Archive Semantics

`archived` 表示：

- 默认不再出现在 browse / search / recommendation 中
- 默认不允许新的 install / adoption
- 历史版本仍然可被 resolver / preview / diagnostics 访问
- UI / API 应清楚表明该 item 已归档

### 6.3 Hard Delete Semantics

`hard delete` 必须是受限操作，并满足至少以下条件：

- 当前没有任何其他 item/version 引用它
- 不需要为历史 preview / resolver 保留该条目
- 调用方具备更高权限或明确的治理意图

若存在引用，必须拒绝硬删，并返回 referrer diagnostics。

### 6.4 Recommended User-Facing Behavior

默认用户操作只暴露：

- `Archive`

高级或治理入口才暴露：

- `Permanent delete`

这样可以显著降低误删和 ref breakage 风险。

## 7. Ownership Move Model

### 7.1 Why In-place Owner Mutation Is Rejected

v1 明确不采用“原地改 owner / organizationId”的设计。原因：

- `@owner/name` 会改变
- 历史 version 的 canonical identity 会变得模糊
- 已持久化的 `registryDependencies` 不会自动跟随
- install provenance / file headers 会与历史 ref 脱钩
- preview artifact key / URL 与页面路径会失配

### 7.2 v1 Move Primitive

v1 将 move 建模为：

- `copy`
- `move`

其中：

- `copy`：从 source item 派生一个 target-owned item，source 保留不动
- `move`：内部先执行 `copy`，再将 source item 标记为 `archived`

也就是说，`move` 的底层实现仍然是 copy-based migration。

### 7.3 Move Relationship Record

建议新增关系表，例如：

`registry_item_moves`

建议字段：

- `id`
- `sourceItemId`
- `targetItemId`
- `sourceOwnerRef`
- `targetOwnerRef`
- `mode` (`copy | move`)
- `createdBy`
- `createdAt`
- `notes`（可选）

这个表的职责是：

- 保留 ownership migration lineage
- 供 UI / MCP / diagnostics 展示迁移关系
- 为未来 alias / redirect / dependency migration 提供基础

## 8. Move Flow

### 8.1 Input

输入至少包括：

- source item identity
- target scope（organization，未来可扩展）
- requested mode（`copy` 或 `move`）

### 8.2 Validation

执行前必须校验：

- source item 存在且调用方有读取权限
- 调用方对 target scope 有写权限
- target scope 下不存在重名 item

v1 对重名的处理建议为：

- 直接阻止

不要在第一阶段引入 replace/merge 语义。

### 8.3 Write Path

`copy` / `move` 的核心写流程建议为：

1. 读取 source 当前 item snapshot
2. 读取 source 当前 files
3. 在 target scope 创建新 item
4. 将 source 当前版本号作为 target 初始版本号继续起链
5. 复制当前 snapshot/files/version metadata
6. 写入 `registry_item_moves`
7. 为 target enqueue preview artifact rebuild
8. 若 mode=`move`，将 source 标记为 `archived`

### 8.4 Historical Versions

v1 不建议把 source 的整条 version history 直接“搬家改 owner”。

更稳妥的做法是：

- source 历史保持不动
- target 从 source 当前版本快照开始
- target metadata 可带：
  - `movedFrom`
  - `movedFromVersion`

这样迁移关系明确，历史身份也不会被篡改。

## 9. Dependency and Resolver Rules

### 9.1 Inbound Dependencies

若其他 item 依赖了 source ref：

- v1 不自动改写这些 inbound refs
- `move` 后 source 应保留为 `archived`，而不是直接消失
- 下游消费者后续可显式迁移到 target ref

### 9.2 Outbound Dependencies

source item 当前 snapshot 中声明的 outbound `registryDependencies` 可以原样复制到 target。

因为 target item 是 source 当前状态的延续，而不是语义重写。

### 9.3 Resolver / Preview Expectations

resolver 与 preview 需要满足：

- `archived` item 默认不出现在 browse/search 中
- 但 direct resolution 仍然可用，尤其是历史版本和已有引用
- diagnostics 应明确标出 archived status

## 10. Preview Artifacts

preview artifact 是缓存与分发产物，不是 canonical source of truth。

因此迁移后：

- 不应直接复用 source artifact row 作为 target artifact
- target item/version 应重新 enqueue artifact build
- source archived 后，已有 artifact 可以保留作为历史访问缓存

## 11. API Shape (Recommended)

### 11.1 Deletion

建议把单一 delete 语义扩展为显式 action：

- `archive`
- `hard-delete`

可采用：

- 单独 endpoint
- 或统一 action endpoint

但产品与实现都应明确区分这两种 intent。

### 11.2 Move

建议新增显式 move/copy action，而不是复用 PATCH。

推荐请求体至少包括：

```json
{
  "action": "copy|move",
  "targetScope": {
    "type": "organization",
    "id": "org_123"
  }
}
```

推荐响应至少包括：

- `sourceRef`
- `targetRef`
- `mode`
- `sourceStatus`
- `targetVersion`
- `warnings`

## 12. UX Guidance

### 12.1 Delete

默认按钮文案应偏向：

- `Archive component`

而不是直接写：

- `Delete permanently`

若资源仍被引用，弹窗应给出明确提示：

- 哪些 item 正在引用它
- 当前只能归档，不能硬删

### 12.2 Move to Organization

用户看到的动作可以直接叫：

- `Move to organization`

但实现上应明确是 copy-based move。

完成后建议返回：

- 新 ref
- 旧 ref 状态（通常 archived）
- 是否仍有现存依赖方使用旧 ref

## 13. Rollout Plan

### Phase 1

- 增加 archive lifecycle state
- browse / search 默认隐藏 archived
- resolver / preview 继续支持 direct access
- delete API 区分 archive 与 hard-delete

### Phase 2

- 新增 `copy personal item to organization`
- 新增 `registry_item_moves`
- target item 重新构建 preview artifact

### Phase 3

- 新增 `move` = `copy + archive source`
- Web / MCP 增加迁移动作与 diagnostics

### Phase 4

- 评估 alias / redirect
- 评估 inbound dependency migration assistant
- 评估 grace-period 后的 source hard delete

## 14. Agent Execution Checklist

### Agent A: Data Model and Policy

目标：

- 设计并实现 archive lifecycle state
- 设计 move lineage table

任务：

- 更新 [schema.ts](/Users/chenchen/Documents/GitHub/my-app/lib/db/schema.ts)
- 增加 archive / hard-delete / move 所需 schema 字段或表
- 明确 archived item 的查询过滤策略

验收：

- schema 能表达 archive 和 move lineage
- 查询层能区分 active 与 archived

### Agent B: Delete Flow

目标：

- 将当前 hard delete-only 流程升级为 archive-first

任务：

- 改造 [registry.ts](/Users/chenchen/Documents/GitHub/my-app/lib/registry.ts)
- 改造 [route.ts](/Users/chenchen/Documents/GitHub/my-app/app/api/registry/[owner]/[name]/route.ts)
- 保留 referrer diagnostics
- 将 archive 与 hard-delete 错误码和响应分开

验收：

- 默认删除动作不再直接物理删除
- 被引用资源无法硬删

### Agent C: Move / Copy Flow

目标：

- 实现 personal -> organization 的 copy-based move

任务：

- 在 [registry.ts](/Users/chenchen/Documents/GitHub/my-app/lib/registry.ts) 新增 move/copy orchestration
- 复制当前 item snapshot / files / version metadata
- 写入 move lineage
- 触发 preview artifact rebuild

验收：

- target scope 能得到独立的新 item
- source 在 move 模式下变为 archived
- 不会原地改 owner

### Agent D: Resolver / Browse / UX Follow-up

目标：

- 让 archived item 的浏览、读取和 diagnostics 行为一致

任务：

- 更新 browse/list 查询默认过滤 archived
- direct read / preview / resolver 保持历史兼容
- Web / MCP 展示 archived / moved 状态

验收：

- archived item 不再出现在默认浏览结果
- 历史直链和现有引用仍可工作

## Related

- [Registry Dependency Management Spec](./registry-dependency-management-spec.md)
- [API / Service Extraction Spec](./api-service-extraction-spec.md)
- [System Overview](../00-overview/system-overview.md)

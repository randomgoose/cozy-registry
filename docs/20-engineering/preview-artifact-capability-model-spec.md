Status: proposed
Owner: engineering
Last updated: 2026-04-04
Source of truth: yes

# Preview Artifact Capability Model Spec

本文定义 Cozy Registry 的 preview artifact 能力分层模型。

目标是解决当前系统中过多组件被降级到纯 runtime preview、导致“虽然没被拦，但体验依然很差”的问题。

核心思想：

- 不是所有组件都必须达到“完全受控预构建”才能快速可看
- 也不是一旦达不到 fully managed 就只能退回纯 runtime preview

系统应支持三种明确能力层级：

- `managed-artifact`
- `compatible-artifact`
- `runtime-only`

## 1. Problem Statement

当前 preview 体验的主要问题不是只有“被拦截”，而是：

- 太多组件即使 publish 成功，最终仍只能走 runtime preview
- 这使得 story open / story switch 的体感没有显著优于旧模型
- 对用户而言，“没失败”不等于“好用”

如果平台目标是让用户在上传后尽快看到内容（目标：2 秒内），那仅仅通过放宽依赖准入、让更多组件进入 runtime external 路径，是不够的。

真正需要的是：

- 扩大 **artifact-first** 路径的覆盖范围
- 允许一部分组件进入“兼容型 artifact”
- 把纯 runtime preview 压缩为最后的降级车道

## 2. Goals

- 让更多已发布组件能够走 artifact-first 预览路径
- 降低“不是 fully managed 就只能 runtime-only”的二元降级
- 在不放弃安全和治理边界的前提下，提高 story preview 体感
- 为 UI 和状态接口提供更贴近产品目标的语义
- 在系统中引入正式 capability contract，而不再从 dependency decision 或 artifact status 反推能力层

## 3. Non-Goals

以下不属于本 spec 当前阶段目标：

- 浏览器内实时编辑代码
- 让任意第三方依赖都变成 fully managed artifact
- 取消第三方依赖治理与风险分层
- 让 runtime preview 完全消失

## 4. Product Principle

对用户而言，平台应该尽量实现：

**先快速可看，再逐步提升为高等级产物。**

而不是：

**先满足所有平台治理要求，才允许预览。**

## 5. Capability Tiers

### 5.1 `managed-artifact`

定义：

- 平台高置信、受控、可复现的预构建 artifact

典型特征：

- 依赖已进入平台受控治理路径
- 关键第三方依赖由 provider 稳定提供
- artifact 可稳定生成并缓存
- 适合作为缩略图、稳定分享、后续高置信分析的基础

用户侧体验：

- `Preview ready`
- 默认不需要额外提示

### 5.2 `compatible-artifact`

定义：

- 平台允许生成 artifact shell，但部分依赖仍在 runtime 补齐

典型特征：

- story entry、theme、registryDependencies、页面框架等都已预构建
- 一部分第三方依赖保留为 external/import-map/runtime-loaded
- 仍显著优于纯 runtime preview
- 不是 fully managed，但可以作为 artifact-first 主路径的一部分

用户侧体验：

- `Preview ready`
- 可在非强打扰位置提示：
  - `Compatibility mode`
  - `Some dependencies load at runtime`

### 5.3 `runtime-only`

定义：

- 组件只能通过 runtime external 路径完成预览
- 不生成稳定可复用的 artifact

典型特征：

- 当前依赖条件或策略不足以生成 artifact
- 应作为降级车道，而不是默认主路径

用户侧体验：

- `Preview ready (runtime only)` 或
- `Prebundle skipped by policy`

## 6. Why `compatible-artifact` Exists

这是本模型最关键的新增层。

若系统只有：

- fully managed artifact
- runtime-only

那么大量真实 UI 组件会因为依赖还未完全进入受控 provider，就被直接打回 runtime preview。

`compatible-artifact` 的作用就是：

- 保留 artifact-first 的速度优势
- 同时允许一部分长尾依赖在浏览器端补齐

它不是失败，也不是临时 hack，而是正式的中间能力层。

## 7. Recommended System Mapping

### 7.1 From Dependency Governance to Artifact Capability

第三方依赖治理结果不应直接映射成“能 prebundle / 不能 prebundle”两档。

推荐映射为：

- `trusted-built-in + provider-controlled`
  - `managed-artifact`
- `soft-allowed` 或 namespace-default compatible packages
  - `compatible-artifact`
- 明确越界或不适合 artifact 的情况
  - `runtime-only`

### 7.2 Namespace Defaults

对于如：

- `@base-ui/*`
- `@radix-ui/*`

这类 UI 生态，推荐默认策略不是直接扔进 `runtime-only`，而是：

- 默认进入 `compatible-artifact`

之后再把高频、验证过的子包提升为：

- `managed-artifact`

### 7.3 Trusted Built-ins

如下常见包应优先稳定进入 `managed-artifact`：

- `class-variance-authority`
- `clsx`
- `tailwind-merge`
- `lucide-react`

否则大量“简单组件”也会被错误地拖回 runtime-only。

## 8. Build Decision Contract

preview build / artifact worker 的决策不应再只输出：

- build ready
- skipped
- failed

还必须先输出 capability tier：

- `managed-artifact`
- `compatible-artifact`
- `runtime-only`

然后再决定具体 artifact 状态。

### 8.0 Capability vs Status

本 spec 明确要求：

- `artifactCapability`
- `artifactStatus`

是两个不同层级的概念，不能互相替代。

#### `artifactCapability`

回答的是：

- 这个组件当前属于哪一种 preview artifact 能力层？

推荐值：

- `managed-artifact`
- `compatible-artifact`
- `runtime-only`

#### `artifactStatus`

回答的是：

- 在该能力层之下，这个 artifact 当前构建到哪一步？

推荐值：

- `ready`
- `running`
- `skipped`
- `failed`

示例：

- `managed-artifact + ready`
- `compatible-artifact + ready`
- `runtime-only + skipped`
- `managed-artifact + failed`

结论：

- capability 不应从 status 临时推断
- status 也不应承担 capability 的语义

### 8.0.1 Suggested Metadata Shape

建议在 artifact metadata 或等价状态结构中显式增加：

- `artifactCapability`

示例：

```json
{
  "artifactCapability": "compatible-artifact",
  "status": "ready",
  "reasonCode": null
}
```

这样 worker、status API、UI 才不需要继续从 `ready/skipped/failed` 反推这个 preview 实际属于哪一层。

### 8.1 Suggested Mapping

- `managed-artifact`
  - 通常对应 artifact `ready`
- `compatible-artifact`
  - 也应允许 artifact `ready`
  - 但其产物包含 external/runtime-loaded deps
- `runtime-only`
  - 对应 artifact `skipped`
- 真正构建失败
  - `failed`

### 8.2 `compatible-artifact` Is A Success Path

`compatible-artifact` 必须被正式视为成功分支。

这意味着：

- 它不应被等同于 `skipped`
- 它不应被视为“未 fully managed 的临时失败”
- 只要 artifact shell 可生成并可被 story preview 消费，它就应该允许：
  - `artifactCapability = compatible-artifact`
  - `artifactStatus = ready`

如果这条不写死，系统会持续滑回旧二元模型：

- fully prebundle 成功 → `ready`
- 否则 → `runtime-only` / `skipped`

### 8.3 `runtime-only` Is The Last Degrade Lane

`runtime-only` 不应因为“不是 fully managed”就自动成立。

只有在这些场景时，才应进入 `runtime-only`：

- 连 artifact shell 都无法可靠构建
- 当前策略明确不允许形成可分享 artifact
- 依赖/运行边界使 `compatible-artifact` 也不可接受

否则，系统应优先尝试：

- `compatible-artifact`

而不是直接打回：

- `runtime-only`

### 8.4 `compatible-artifact` Runtime Contract

为避免 `compatible-artifact` 只停留在概念层，本 spec 进一步定义它的运行时 contract。

#### 8.4.1 Thumbnail

`compatible-artifact` 默认应允许生成并消费 thumbnail。

前提是：

- compatible 模式下所需的 external 依赖在 thumbnail runtime 中也有明确加载路径

如果某个组件在 detail preview 可用，但 thumbnail 模式下所需 external 无法安全加载，则该 case 可以单独失败或降级，但这不应成为整体否定 `compatible-artifact` 支持 thumbnail 的理由。

#### 8.4.2 Warm Cache

`compatible-artifact` 必须允许进入 warm cache / artifact cache。

原因：

- 若 compatible-artifact 不能缓存，它就失去了作为 artifact-first 中间层的价值
- 它虽然不是 fully managed，但仍然是正式可复用产物

因此：

- compatible-artifact 应允许被预热
- 应允许命中 artifact cache
- 不应因为含有 external/runtime-loaded 依赖就被排除在缓存体系之外

#### 8.4.3 Runtime External Ownership

`compatible-artifact` 中的 runtime external 依赖，必须由平台 runtime contract 显式保障可加载。

这意味着：

- external 依赖必须来自平台已知的 runtime dependency plan
- import map / loader mapping 必须由平台生成
- 不能把“external 出去”当作“浏览器会自己想办法加载”

结论：

- runtime external 的责任在平台
- 不在用户环境偶然状态
- 也不在宿主 app 的隐式依赖存在性

#### 8.4.4 Failure Conditions

即使 capability 为 `compatible-artifact`，最终仍可能进入 `failed`，但失败条件必须明确。

典型包括：

- artifact shell 本身构建失败
- runtime external dependency plan 无法生成
- 某个 required external 没有可用的 provider / import map target
- thumbnail 或特定 story mode 下，必要 external 无法安全加载
- 组件在真实 runtime 渲染阶段抛错

这意味着：

- `compatible-artifact` 是正式成功能力层
- 但不是“永远不会失败”的保证
- 其失败原因必须可诊断，且不应与 `runtime-only` / `skipped` 混淆

## 9. User-Facing Semantics

用户不应被迫理解内部所有构建层级，但系统仍应传达正确状态。

推荐用户侧可见语义：

1. `Preview ready`
2. `Preview ready (compatibility mode)`
3. `Preview ready (runtime only)`
4. `Preview failed`

推荐映射：

- `managed-artifact` → `Preview ready`
- `compatible-artifact` → `Preview ready (compatibility mode)`
- `runtime-only` → `Preview ready (runtime only)` / `Prebundle skipped by policy`

不建议直接在主 UI 中暴露：

- `managed-artifact`
- `compatible-artifact`

这更适合作为系统内部模型与 debug 信息。

## 10. Performance Expectations

本模型的目标不是增加 runtime preview 占比，而是：

- 让更多组件从 `runtime-only` 上升到 `compatible-artifact`
- 再让高频稳定组件从 `compatible-artifact` 上升到 `managed-artifact`

### 10.1 Expected UX by Tier

`managed-artifact`

- 打开最快
- 切 story 最稳
- 网络环境依赖最小

`compatible-artifact`

- 应明显优于纯 runtime-only
- 允许少量 external 依赖在浏览器端补齐
- 仍应满足“上传后尽快可看”的产品目标

`runtime-only`

- 保留为降级路径
- 不应成为大量普通组件的默认命运

## 11. Rollout Strategy

### Phase 1

- 在系统中引入 capability tier 概念
- 在 metadata / worker decision 中显式增加 `artifactCapability`
- 将现有 `prebundle-supported / runtime-only` 二元判断升级为三档：
  - `managed-artifact`
  - `compatible-artifact`
  - `runtime-only`

### Phase 2

- 对 namespace 规则（如 `@base-ui/*`）默认走 `compatible-artifact`
- 不再默认直接打到 `runtime-only`

### Phase 3

- 通过 dependency provider 稳定 trusted built-ins
- 将高频简单组件提升到 `managed-artifact`

### Phase 4

- 缩小 `runtime-only` 覆盖面
- 将其保留给真正难处理或高风险 case

## 12. Acceptance Criteria

当这套模型落地后，应满足：

- 大量普通 UI 组件不再因为“不是 fully managed”就直接退回 runtime-only
- namespace-default 的 UI 生态（例如 `@base-ui/*`）能优先进入 `compatible-artifact`
- 高频简单组件可稳定进入 `managed-artifact`
- 用户侧能感知到“预览可用”，而不是被大量 `skipped`/runtime-only 拖慢体验
- runtime-only 从默认降级路径变成少数 case 的最终兜底

## 13. Agent Execution Checklist

### Agent A: Capability Tier Model

目标：

- 在 preview artifact 体系中引入 capability tier

任务：

- 定义 `managed-artifact | compatible-artifact | runtime-only`
- 明确它们与现有 dependency governance 的映射关系
- 明确 `artifactCapability` 与 `artifactStatus` 的分层 contract

验收：

- 系统内部不再只有 `prebundle-supported` vs `runtime-only` 两档思维
- capability 不再从 status 临时反推

### Agent B: Build / Worker Integration

目标：

- 让 artifact worker 能生成 compatible artifact

任务：

- 调整 artifact 决策逻辑
- 允许部分 external/runtime-loaded deps 的 artifact 仍记为可用
- 让 `compatible-artifact` 能产生 `status = ready`
- 仅在最后降级时才写入 `runtime-only + skipped`

验收：

- `compatible-artifact` 不会被错误打成 `skipped` 或 `failed`
- `runtime-only` 不再是“不是 fully managed”的默认去向

### Agent C: UI / Status Semantics

目标：

- 给用户正确但不过度工程化的状态表达

任务：

- 统一页面、详情页、story selector、status endpoint 的文案与状态映射

验收：

- 用户能区分 `ready / compatibility mode / runtime only / failed`
- 但不需要理解内部实现细节

## Related

- [Story Preview UX / Performance Spec](./story-preview-ux-performance-spec.md)
- [Preview Third-Party Dependency Governance Spec](./preview-third-party-dependency-governance-spec.md)
- [Preview Build Performance Spec](./preview-build-performance-spec.md)
- [Preview Stories Spec](./preview-stories-spec.md)

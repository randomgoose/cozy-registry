Status: proposed
Owner: engineering
Last updated: 2026-04-02
Source of truth: yes

# Preview Third-Party Dependency Governance Spec

本文定义 Cozy Registry 中第三方 npm/bare-module 依赖在以下环节的统一策略：

- publish 校验
- runtime preview
- preview artifact prebuild
- diagnostics / UX 提示

目标不是“无限制地动态安装用户声明的任何包”，也不是“一遇到未知依赖就直接拒绝首次发布”，而是建立一套 **受控、分级、可渐进收口** 的平台依赖治理模型。

## 1. Problem Statement

当前 preview 系统对第三方依赖存在两套不同语义：

- runtime preview 路径通常将 bare module 依赖 external 化，并通过 import map / CDN 提供运行时解析
- artifact prebuild 路径在 `externalizeDependencies: false` 时尝试将第三方依赖直接 bundle 进 `preview.js`

当前 artifact prebuild 的解析来源仍然依赖宿主仓库已有的 `node_modules`。这意味着：

- preview artifact 的成功与否依赖于宿主应用恰好预装了哪些包
- 组件的 `dependencies` 并不是独立、受控、可复现的输入
- runtime preview 与 artifact preview 不是同一种依赖 contract

这是一个过渡模型，不适合作为长期平台基础。

### 1.1 Current Known Limitation

当前实现已经能在 publish 前对第三方依赖做治理分类，但对 `prebundle-supported` 依赖的真实解析仍存在一个已知限制：

- publish preview smoke 对 `prebundle-supported` 依赖不会再 stub，而是要求真实模块可解析
- 这一步当前仍依赖宿主仓库的 `node_modules` / `appRequire(...)`
- 因此即使某个依赖已经被治理层判定为 `trusted-built-in + prebundle-supported`，只要宿主环境未安装对应包，smoke 仍可能失败

这说明当前系统已经拥有：

- dependency governance contract

但还没有完全拥有：

- platform-controlled dependency provider contract

`class-variance-authority@0.7.1` 这类 case 暴露的正是这个缺口。

## 2. Goals

- 提升组件首次发布成功率，不因常见第三方依赖直接“首发失败”
- 让第三方依赖从“宿主环境事实”升级为“平台受控输入”
- 统一 runtime preview 与 artifact preview 的依赖决策来源
- 为安全、可复现、可观测的 preview 构建提供明确边界

## 3. Non-Goals (v1)

以下能力不属于本 spec 的第一阶段：

- 对任意用户声明依赖进行全量在线动态安装
- 完整 npm registry 代理或 lockfile 复制系统
- 组织级自定义包仓库与私有 npm 凭据注入
- 对所有第三方依赖做自动安全审计与许可证治理
- 将宿主 `node_modules` 兼容路径立刻彻底移除

## 4. Design Principles

### 4.1 Publish success should win over premature strictness

首次发布体验优先。未知但低风险的常见依赖不应一上来就触发硬失败，除非它明确超出平台边界。

### 4.2 Controlled capability is better than binary allow/deny

平台应管理的是“依赖在系统中享有哪些能力”，而不只是“是否允许存在”。

### 4.3 Preview must consume a single dependency decision model

runtime preview 与 artifact prebuild 可以采用不同输出策略，但必须共享同一份依赖准入和能力决策。

### 4.4 Host-installed packages are a compatibility fallback, not the platform contract

宿主仓库 `node_modules` 可以作为短期兼容和开发 fallback，但不能继续作为长期生产 contract。

## 5. Core Contracts

本节定义本 spec 的三条核心 contract。后续 publish、preview、artifact worker、UI diagnostics 都必须服从这里的决议，不能各自推断。

### 5.1 Admission Contract: Unknown Packages Default to Compatibility Mode

平台对“第一次出现的未知第三方包”采用 **兼容模式**，而不是严格 catalog-only 模式。

明确决议：

- 未知包 **默认不直接进入 `rejected`**
- 未知包只要通过基础边界校验，就归类为 `soft-allowed`
- 只有明确越界的包才归类为 `rejected`

基础边界校验至少包括：

- 不是 Node builtin
- 不是明显 server-only / native-only 包
- 不是明显不适合浏览器 preview 的依赖
- specifier 语法合法

建议实现判定顺序：

1. 先查 platform catalog 中的显式 override
2. 再查 Node builtin / `node:*` specifier
3. 再查显式 browser-blocked package 列表
4. 再根据 package metadata、导出形态或命名规则判断是否明显 server-only / native-only
5. 若无法明确判为越界，则默认进入 `soft-allowed`

这意味着：

- 平台之前没见过的包，首次出现时默认是 `soft-allowed`
- `catalog` 的角色是：
  - 明确哪些包是 `runtime-provided`
  - 明确哪些包是 `trusted-built-in`
  - 明确哪些包是 `rejected`
- `catalog` 之外的未知包不会被自动拒绝，而是先进入 compatibility mode

建议将以下输入直接视为 `rejected`：

- `node:*` imports
- Node builtin 别名（如 `fs`、`path`、`crypto`、`child_process`）
- 明确依赖原生 binding 或 postinstall/native compile 的包
- 平台维护的 browser-blocked / server-only blocklist 中的包

### 5.2 Version Contract: Explicit Publish Payload Is the Only Trusted Version Source

平台执行第三方依赖版本策略时，唯一可信的版本来源是 **publish payload 中的显式依赖声明**。

明确决议：

- 源码扫描只负责发现“用了哪个包”
- 源码中的 bare import 不提供版本信息
- 平台 **不得** 从宿主 `node_modules`、构建机环境或 CDN URL 反推并固化版本

推荐依赖声明结构：

```json
[
  { "name": "lucide-react", "version": "0.511.0" },
  { "name": "date-fns", "version": "4.1.0" }
]
```

当源码使用了第三方包，但 publish payload 未提供版本时：

- 允许 publish 成功
- 该依赖只能进入 `soft-allowed + runtime-only`
- 该依赖 **不得** 进入 `prebundle-supported`
- diagnostics 必须明确标为 `version=unknown`

即使该包本身位于 `trusted-built-in` catalog 中，只要本次 publish payload 没有提供显式版本，也必须按上面的降级规则处理，不能因为“平台认识这个包”就自动提升到 `prebundle-supported`。

也就是说：

- 源码负责 “discovery”
- payload 负责 “version intent”
- 只有显式版本声明才能支撑可复现的 prebuild contract

### 5.3 Artifact Contract: Runtime-only Dependencies Produce `skipped`, Not `failed`

当组件包含仅允许 `runtime-only` 的依赖时，preview artifact 的官方状态不是 `failed`，也不是无限 `pending`，而是 **`skipped`**。

明确决议：

- `skipped` 是正式状态，表示：
  - publish 成功
  - artifact 未生成 bundle，不是因为错误
  - 而是因为当前依赖策略不允许 prebundle
- UI、worker、status API 都必须把它视为 “policy-degraded but valid”，不是 “build failed”

建议原因码：

- `SKIPPED_RUNTIME_ONLY_DEPENDENCIES`
- `SKIPPED_POLICY_NO_PREBUNDLE`

建议 artifact 状态集合至少包括：

- `ready`
- `running`
- `failed`
- `skipped`

对 `skipped` 的接口 / UI 约束：

- status API 必须返回 `status = skipped`
- UI 不应显示为构建失败或红色错误态
- 轮询方在拿到 `skipped` 后必须停止等待 `ready`
- 用户可见提示应明确为 “runtime preview only” 或 “prebundle skipped by policy”

## 6. Dependency Tiers

平台将第三方依赖划分为四层：

### 6.1 `runtime-provided`

示例：

- `react`
- `react-dom`
- `react-dom/client`
- `react/jsx-runtime`

语义：

- 平台内建提供
- 不需要用户声明安装来源
- runtime preview 与 artifact preview 都不应尝试 bundle 它们

### 6.2 `trusted-built-in`

示例（平台维护，小集合）：

- `lucide-react`
- `clsx`
- `class-variance-authority`
- `tailwind-merge`

语义：

- 平台受支持的常用第三方依赖
- 允许在 publish 时通过
- 允许 artifact prebuild 在受控环境中解析并 bundle

### 6.3 `soft-allowed`

语义：

- 允许 publish 成功
- 但只提供受限能力
- 默认不进入稳定 prebundle 路径
- 通常仅允许 runtime external / CDN import map 模式

这是提升首次发布成功率的关键层级。

### 6.4 `rejected`

示例：

- 需要 Node 内置模块的包
- 需要原生 binding 的包
- 明显不适合浏览器 preview 的服务端包
- 平台明确禁止的高风险包

语义：

- publish 直接失败
- 不进入 preview build 流程

## 7. Dependency Catalog

平台应维护一份 dependency catalog，作为受控输入源。

建议数据模型至少包括：

- `packageName`
- `tier`
- `allowedVersionPolicy`
- `previewCapability`
- `notes`
- `introducedAt`
- `deprecatedAt`（可选）

其中：

- `tier` ∈ `runtime-provided | trusted-built-in | soft-allowed | rejected`
- `previewCapability` ∈ `runtime-only | prebundle-supported | blocked`

### 7.1 Version Policy

建议版本策略至少支持：

- exact
- pinned-major
- pinned-range（仅平台维护使用）

默认建议：

- `runtime-provided`：平台固定
- `trusted-built-in`：精确版本或平台锁定 major
- `soft-allowed`：若无显式版本则保持 `unknown`，仅可 `runtime-only`
- `rejected`：无版本策略，直接不可用

补充规则：

- `trusted-built-in` 只有在 payload 提供显式版本，且该版本满足 catalog policy 时，才能获得 `prebundle-supported`
- `trusted-built-in` 若缺少显式版本，必须降级为 `runtime-only`
- 平台不得使用宿主 `node_modules` 中实际解析到的版本来“补全”缺失版本

## 8. Publish-Time Behavior

### 8.1 Dependency Discovery

publish 流程中继续通过源码扫描和显式字段发现 bare-module 依赖：

- `item.dependencies`
- `extractDependencies(source files)`

但这些发现结果不再只是信息展示，而要进入平台治理决策。

### 8.2 Classification Rules

publish 时对每个 bare dependency 执行分类：

1. 匹配 `runtime-provided`
2. 匹配 `trusted-built-in`
3. 匹配 catalog 中明确标记为 `rejected`
4. 若未知但通过基础边界校验，则归入 `soft-allowed`
5. 若未知且明确越界，则归入 `rejected`

### 8.3 Publish Outcome

发布结果按 tier 决定：

- `runtime-provided`：允许
- `trusted-built-in`：允许
- `soft-allowed`：允许，但附带 warning / degraded capability diagnostics
- `rejected`：直接拒绝 publish

其中：

- 未知包首次出现时，默认走 `soft-allowed`
- `rejected` 必须有明确理由，而不是“catalog 里没有”

### 8.4 Version Handling at Publish Time

publish 校验必须区分“发现包名”和“拿到可信版本”：

- 若 payload 中存在结构化版本声明，则按声明执行版本策略
- 若只有 bare import / 非结构化依赖名，没有版本，则：
  - 允许 publish
  - 标记 `versionPolicyStatus = unknown`
  - 限制为 `runtime-only`

这条规则必须在 publish 阶段就固化，不能把“版本未知”的问题拖到 artifact worker 再处理。

### 8.5 Why This Avoids Bad First-Publish UX

这样用户首次发布常见组件时，平台可以：

- 让组件先成功入库
- 同时明确提示其依赖当前是：
  - fully supported
  - compatibility mode
  - rejected

而不是把“平台治理”全部压成首发失败。

## 9. Preview Capability Model

每个依赖除 tier 外，还应映射为 preview capability。

### 9.1 `runtime-only`

语义：

- runtime preview 可通过 import map / CDN 提供
- artifact prebuild 不尝试将其内联进产物

典型适用：

- `soft-allowed`
- 某些短期兼容依赖

### 9.2 `prebundle-supported`

语义：

- 允许在 artifact worker 的受控依赖环境中解析
- 允许 bundle 进 `preview.js`

典型适用：

- `trusted-built-in`

### 9.3 `blocked`

语义：

- runtime 与 prebuild 都不可用
- publish 直接失败

## 10. Runtime Preview Rules

runtime preview 不应再简单把所有 bare deps 一视同仁映射到 CDN。

推荐规则：

- `runtime-provided`：由平台 import map 提供
- `trusted-built-in`：
  - 可选择 runtime import map 或 artifact hit 时不需要额外引入
- `soft-allowed`：
  - 允许 runtime import map external
  - 但在 diagnostics 中明确这是 compatibility mode
- `rejected`：
  - 不应走到 runtime preview；publish 应已失败

runtime preview 的 import map 必须来自“已分类依赖集”，而不是临时对所有 bare imports 一把梭。

## 11. Artifact Prebuild Rules

artifact prebuild 是受控构建路径，应更严格。

推荐规则：

- `runtime-provided`：始终 external
- `trusted-built-in`：允许 bundle
- `soft-allowed`：默认不 bundle，继续 external/runtime-only，并将 artifact 标记为 `skipped`
- `rejected`：不应进入 prebuild

### 11.1 Official Artifact Semantics for Runtime-only

当组件命中了 `runtime-only` 依赖时：

- artifact worker 不应把这类情况记为 `failed`
- artifact worker 不应把这类记录无限留在 `pending`
- artifact 状态应写为 `skipped`

`skipped` 的语义是：

- 当前组件可发布、可 runtime preview
- 但当前策略下不生成稳定 prebundle artifact

这必须成为 worker、状态接口和 UI 的一致语义。

### 11.2 Short-Term Compatibility

短期可保留宿主 `node_modules` 作为 fallback，以维持现有系统可运行。

但必须满足：

- 只用于兼容或开发环境
- 不作为长期平台 contract 写入文档主叙事
- diagnostics 中可区分“host fallback used”

### 11.3 Long-Term Direction

长期 artifact worker 应在隔离 workspace 中，根据 dependency catalog + 受控版本策略构建最小依赖环境，再交给 esbuild。

也就是说：

- 不再默认依赖宿主仓库的 `node_modules`
- 依赖来源必须可解释、可复现、可收口

## 11.4 Dependency Provider Repair Strategy (normative)

为修复 “治理已通过但 smoke / prebuild 仍依赖宿主 `node_modules`” 的问题，平台必须引入统一的 **dependency provider** 层。

### 11.4.1 Required boundary

新增统一边界，例如：

- `preview-dependency-provider`

职责：

- 输入：`dependencyDecisions`
- 输出：
  - 哪些依赖应保持 `runtime-only`
  - 哪些依赖应进入 `prebundle-supported`
  - 对 `prebundle-supported` 依赖，平台应从哪里获取真实可解析模块

这个 provider 必须成为以下路径的共享输入：

- publish preview smoke
- runtime preview import-map 生成
- preview artifact prebuild

### 11.4.2 What must change

当前系统的问题不是 governance 缺失，而是 “真实解析来源” 仍然绑定宿主环境。

因此修复方向必须是：

- 不再默认通过宿主 `appRequire(spec)` 解析 `prebundle-supported` 依赖
- 改为通过 dependency provider 返回的受控来源进行解析

### 11.4.3 Accepted near-term implementation

第一阶段允许的平台实现方式：

1. **Vendor trusted built-ins**
   - 平台为少量 trusted built-ins 维护受控副本或固定版本产物
   - smoke / prebuild 都从该受控来源读取

2. **Prewarmed internal cache/store**
   - 平台预先准备 trusted built-ins 的固定版本缓存
   - worker / smoke 从该缓存读取

第一阶段不要求：

- 任意 npm 包在线安装
- 面向未知包的通用包管理器

### 11.4.4 Short-term compatibility rule

宿主 `node_modules` 可以作为短期 fallback 保留，但必须满足：

- 只用于兼容路径或开发环境
- 需要有显式 diagnostics 标识 `hostFallbackUsed`
- 不得再作为 `prebundle-supported` 成功语义的唯一保障

### 11.4.5 Required behavior for trusted built-ins

对于 `trusted-built-in` 且带显式版本声明的依赖：

- 若 provider 有受控来源，则 smoke / prebuild 必须使用 provider
- 若 provider 暂无受控来源：
  - 可以临时回退到 host fallback
  - 但 diagnostics 必须明确标注这是过渡路径
  - 不得把这种状态误描述成“平台已完全受控支持”

### 11.4.6 Example

对于：

```json
{
  "dependencies": [
    { "name": "class-variance-authority", "version": "0.7.1" }
  ]
}
```

治理层应得到：

- `tier = trusted-built-in`
- `previewCapability = prebundle-supported`

修复后的 smoke / artifact 路径不应再简单依赖：

- 宿主仓库是否恰好安装了 `class-variance-authority`

而应优先依赖：

- provider 返回的 `class-variance-authority@0.7.1` 受控来源

## 12. Diagnostics and UX

### 12.1 Publish Diagnostics

publish 响应应包含依赖诊断信息，至少包括：

- `packageName`
- `requestedVersion`
- `tier`
- `previewCapability`
- `versionPolicyStatus`
- `message`

### 12.2 User-Facing Messaging

当依赖为 `soft-allowed` 时，不应显示为“失败”，而应显示为：

- 已发布成功
- 当前依赖处于 compatibility mode
- artifact preview / thumbnail / reproducibility 可能受限

当依赖没有显式版本时，还应显示：

- 当前依赖版本未锁定
- 仅支持 runtime-only

### 12.3 Operator Diagnostics

系统内部应可区分：

- publish accepted with degraded preview capability
- publish accepted with unknown dependency version
- artifact build used host fallback
- artifact build skipped bundling for runtime-only deps
- artifact status skipped by policy

### 12.4 Suggested Boundary-Check Sources

为避免不同实现各自猜测，“基础边界校验”建议至少共享以下输入源：

- Node builtin 列表
- platform-maintained browser-blocked package 列表
- platform-maintained trusted-built-in / rejected catalog
- package metadata / export hints（仅用于辅助判断，不用于反推版本）

当这些来源不足以明确证明某个未知包越界时，默认回到 `soft-allowed`，而不是直接拒绝。

## 13. Security and Stability Rationale

本模型比“用户声明什么就全量安装什么”更安全，因为：

- 依赖准入由平台 catalog 控制
- `soft-allowed` 不自动获得完整 prebundle 权限
- `rejected` 在 publish 阶段就失败，而不是在 worker 中临时炸掉

本模型比“所有未知依赖都直接拒绝”更可用，因为：

- 首次发布成功率更高
- 平台可以观察真实生态后逐步升级 trusted built-ins
- 用户能理解能力差异，而不是只看到硬性门槛

## 14. Rollout Plan

### Phase 1: Classification and Diagnostics

- 引入 dependency catalog
- 对 publish 依赖做 tier 分类
- `rejected` 直接失败
- `soft-allowed` 允许 publish 并返回 warning
- 无显式版本的第三方依赖记录为 `version=unknown`
- runtime preview / artifact preview 继续沿用现有机制，但消费分类结果

### Phase 2: Capability-Aware Preview

- runtime import map 仅为允许的 runtime deps 生成
- artifact prebuild 仅对 `prebundle-supported` 依赖尝试 bundle
- 对 `runtime-only` 依赖写入 artifact `skipped` 状态
- 记录 host fallback 使用情况

### Phase 3: Isolated Artifact Dependency Environment

- artifact worker 切换到隔离依赖环境
- `trusted-built-in` 依赖在受控 workspace 中解析
- 宿主 `node_modules` fallback 降为调试/兼容开关

### Phase 4: Catalog Governance

- 统计高频 `soft-allowed` 依赖
- 将成熟依赖提升为 `trusted-built-in`
- 收紧长期不稳定或高风险依赖

## 15. Suggested Data Shape

推荐新增内部决策结构，例如：

```json
{
  "dependencies": [
    {
      "packageName": "lucide-react",
      "requestedVersion": "0.511.0",
      "tier": "trusted-built-in",
      "previewCapability": "prebundle-supported",
      "versionPolicyStatus": "accepted",
      "message": "Allowed and can be bundled into preview artifacts."
    },
    {
      "packageName": "date-fns",
      "requestedVersion": null,
      "tier": "soft-allowed",
      "previewCapability": "runtime-only",
      "versionPolicyStatus": "unknown",
      "message": "Published in compatibility mode without an explicit version; artifact prebundle is disabled."
    }
  ]
}
```

建议 artifact 状态输出结构至少支持：

```json
{
  "status": "skipped",
  "reasonCode": "SKIPPED_RUNTIME_ONLY_DEPENDENCIES",
  "message": "Artifact prebundle was skipped by policy because one or more dependencies are runtime-only."
}
```

## 16. Agent Execution Checklist

### Agent A: Catalog and Classification

目标：

- 建立 dependency catalog 与 tier/classification 逻辑

任务：

- 在 publish 入口与 preview 输入路径中引入统一分类函数
- 定义 catalog 存储方式（代码内置或 DB）
- 明确默认 trusted / soft-allowed / rejected 集合
- 明确基础边界校验（决定 unknown 是 soft-allowed 还是 rejected）

验收：

- 对同一份依赖输入，publish 与 preview 可得到一致分类结果
- 未知包默认进入 `soft-allowed`，除非明确越界

### Agent B: Publish Validation and Diagnostics

目标：

- 将依赖治理前移到 publish contract

任务：

- 改造 publish validation
- 为 `soft-allowed` 输出 warning
- 为 `rejected` 输出阻塞性错误
- 为未显式声明版本的依赖输出 `version=unknown`

验收：

- 不再把不受支持依赖留到 artifact build 时才第一次暴露
- 版本未知依赖不会被错误提升到 prebundle-supported

### Agent C: Runtime Preview Integration

目标：

- runtime import map 只消费已分类、已允许的依赖

任务：

- 更新 [route.ts](/Users/chenchen/Documents/GitHub/my-app/app/preview/[owner]/[name]/route.ts)
- 将 runtime import map 生成逻辑建立在 dependency decision 上

验收：

- runtime preview 与 publish diagnostics 的依赖结果一致

### Agent D: Artifact Prebuild Integration

目标：

- artifact prebuild 按 capability 区分 bundle / external

任务：

- 更新 [preview-artifact-jobs.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-artifact-jobs.ts)
- 更新 [preview-build.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-build.ts)
- 为宿主 `node_modules` fallback 增加显式 diagnostics
- 为 `runtime-only` 依赖写入 `skipped` artifact 状态

验收：

- 只有 `prebundle-supported` 依赖会进入稳定 prebundle 路径
- `runtime-only` 组件不会被误标为 artifact build failed

### Agent E: Isolated Build Environment (later phase)

目标：

- 将 artifact worker 从宿主依赖模型迁移到隔离依赖环境

任务：

- 设计并实现最小依赖 workspace
- 保留 feature flag 兼容路径

验收：

- artifact build 不再默认依赖宿主仓库预装依赖

### Agent F: Dependency Provider

目标：

- 引入统一的受控依赖提供层，消除 governance-approved 依赖对宿主解析的硬绑定

任务：

- 新建 provider 层（建议：`lib/preview-dependency-provider.ts`）
- 让 publish smoke 与 artifact prebuild 都通过 provider 获取 `prebundle-supported` 依赖来源
- 为 host fallback 增加显式 diagnostics

验收：

- `trusted-built-in + explicit version` 的依赖不再仅依赖宿主 `node_modules` 才能 smoke 通过
- smoke 与 artifact prebuild 共享同一套真实解析来源决策

## Related

- [Component Preview Runtime](./component-preview-runtime.md)
- [Preview Build Performance Spec](./preview-build-performance-spec.md)
- [Publish Preview Smoke Gate](./publish-preview-smoke-gate.md)
- [Registry Dependency Management Spec](./registry-dependency-management-spec.md)

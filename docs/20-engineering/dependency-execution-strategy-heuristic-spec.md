Status: proposed
Owner: engineering
Last updated: 2026-04-07
Source of truth: yes

# Dependency Execution Strategy Heuristic Spec

本文定义 Cozy Registry 后续如何从“主要依赖白名单/规则表决定 preview 命运”的模式，演进到：

- **治理层决定边界**
- **执行层按依赖复杂度与平台能力自动选择构建策略**

同时，本文也把“平台控制的缓存/CDN 交付层”纳入同一套模型，避免 compatible mode 长期绑定在 `esm.sh` 冷拉路径上。

## 1. Problem Statement

当前系统已经有一套第三方依赖治理模型：

- `tier`
- `previewCapability`
- `providerMode`
- `artifactCapability`

这些规则主要由：

- exact package rule
- namespace rule
- fallback rule

驱动。

这套模型有两个现实问题：

1. **太依赖 catalog / 白名单式准入**
   - 许多 browser-safe、可兼容的包，因为没有被提升到更高支持等级，就容易掉进 `runtime-only`

2. **compatible mode 目前仍过度依赖 `esm.sh`**
   - artifact shell 虽然 ready，但外部依赖仍要浏览器在运行时去外部 CDN 拉取
   - 这会继续拖慢首次加载

因此需要一套新模型：

- 治理层仍负责“允不允许”
- 执行层再根据依赖复杂度与平台可交付能力，自动选择：
  - `managed-artifact`
  - `compatible-artifact`
  - `runtime-only`

## 2. Goals

- 减少“因为没进白名单就掉回 runtime-only”的情况
- 让更多 browser-safe 组件进入 artifact-first 路径
- 保持治理边界，不把复杂度启发式误用成“自动放行系统”
- 把 compatible delivery 从“外部现拉”逐步升级到“平台控制缓存/CDN”

## 3. Non-Goals (v1)

以下不属于本 spec 第一阶段：

- 用复杂度系统完全替代治理层
- 自动允许所有未知 npm 包
- 一上来构建完整私有 npm registry
- 让所有 compatible externals 都直接升级成 managed-provider

## 4. Core Decision

正式采用双层模型：

### 4.1 Governance Layer

负责决定：

- 包是否允许存在
- 包属于哪种政策边界

### 4.2 Execution Strategy Layer

负责决定：

- 在治理允许的前提下，该依赖和对应组件应采用哪种构建/交付策略

## 5. Governance Remains The Boundary

治理层继续是正式边界，仍保留：

- exact package rules
- namespace rules
- fallback rules
- blocked rules

治理层输出仍然是正式 source of truth，包括：

- `tier`
- `previewCapability`
- `providerMode`

复杂度启发式**不能**绕过治理层，把一个 blocked 包自动提升成可执行状态。

## 6. Execution Strategy Layer

执行层在治理允许的前提下，再根据输入自动选择更合适的构建路径。

### 6.1 Inputs

执行层输入建议至少包含：

- governance decision
- 是否显式声明版本
- 是否 browser-safe
- 是否存在 import-map target
- transitive dependency count
- estimated bundle size
- package/module format complexity
- provider cache 是否已有命中
- runtime external 是否已有平台可用交付地址

### 6.2 Outputs

执行层输出为正式 artifact 目标路径：

- `managed-artifact`
- `compatible-artifact`
- `runtime-only`

## 7. Recommended Heuristic Model

### 7.1 Managed Artifact

适用于：

- 依赖已进入 `managed-provider`
- 或包已被平台明确 fully managed
- 依赖来源受控
- 构建结果高置信且可复现

### 7.2 Compatible Artifact

适用于：

- 依赖不 fully managed，但被治理层允许
- browser-safe
- 有显式版本
- artifact shell 可稳定生成
- runtime external 依赖有平台可交付地址

compatible artifact 在交付层上可进一步细分为两种：

#### 7.2.1 compatible-remote

- external 依赖仍通过 import map 指向远端兼容源
- 当前典型来源是 `esm.sh`
- 平台不托管该依赖的交付产物，只托管 artifact shell

#### 7.2.2 compatible-bundled

- external 依赖仍然不提升为 `managed-provider`
- 但平台会把该依赖的浏览器可运行版本收敛成一个更少请求数的交付 bundle
- 浏览器最终请求平台控制的 bundle URL，而不是直接请求几十个 ESM module

典型路径可表示为：

- `recharts -> esm.sh -> platform rebundle -> single-file delivery`

而不是：

- `recharts -> esm.sh -> browser fetches many ESM modules`

这类模式的语义是：

- **交付形态被平台优化**
- **治理等级仍然属于 compatible，而不是 fully managed**

### 7.3 Runtime Only

适用于：

- 连 compatible artifact shell 都无法稳定形成
- 或运行时依赖没有可交付方案
- 或当前策略明确要求最终降级

## 8. Why This Is Better Than A Pure Whitelist Model

纯白名单模型的问题是：

- 包要么被提升到 fully supported
- 要么很容易掉进 runtime-only

新模型允许：

- 治理边界仍然保守
- 但执行层更聪明地把“可兼容包”推进到 `compatible-artifact`

这会显著减少：

- `recharts` 这类 browser-safe 包过早掉回 runtime-only
- 因为没进 exact allowlist 而不断手工打补丁

## 9. Platform-Controlled Cache / CDN Layer

### 9.1 Why It Is Needed

如果 compatible mode 一直只是：

- import map → `esm.sh`

那它会长期带着：

- 外部 CDN RTT
- 额外请求数
- 冷缓存慢

因此，compatible mode 的长期目标不应是“永远从 `esm.sh` 现拉”，而应是：

- 先 external
- 再逐步收敛到平台控制的缓存/CDN

### 9.2 Minimal Platform-Controlled Delivery Model

平台控制缓存/CDN 的最小方案不是自建 npm registry，而是：

1. 第一次发现某个 compatible external 依赖（例如 `recharts@x.y.z`）
2. 平台抓取对应浏览器可运行产物
3. 产物存入对象存储
4. 通过平台自有 public URL / CDN 域名提供
5. import map 指向平台控制 URL，而不是直接指向 `esm.sh`

### 9.3 What The Platform Cache Stores

建议至少存：

- package name
- version
- source URL
- fetched timestamp
- content hash
- platform public URL
- format / delivery mode

### 9.4 Immediate Benefit

这样即使依赖仍是 external：

- 第一次会慢一点
- 后面所有 compatible artifact 都能走平台缓存/CDN

这比每次都直接冷拉 `esm.sh` 稳定得多。

### 9.5 Compatible Remote vs Compatible Bundled

平台控制缓存/CDN 一旦建立后，compatible delivery 应正式区分：

1. `compatible-remote`
   - import map 直接指向远端兼容源
   - 最小实现成本
   - 但仍保留外部请求 fan-out

2. `compatible-bundled`
   - 平台先把 compatible external 依赖重新收敛成单文件或少量 chunk
   - 再通过平台缓存/CDN 分发
   - 明显降低首次加载时的请求数

本 spec 建议将 `compatible-bundled` 视为 `compatible-artifact` 的更优交付形态，而不是新的治理等级。

## 10. Provider Modes In The Long Term

平台长期依赖交付可理解为三层：

### 10.1 runtime-provided

- 平台内建
- 例如 React runtime

### 10.2 managed-provider

- 平台自己托管的受控依赖
- 用于 fully managed artifact

### 10.3 compatible-external

- 仍然不是 fully managed
- 但优先从平台控制缓存/CDN 交付
- 不应长期直接等同于“浏览器去 `esm.sh` 现拉”

其运行时交付可继续细分为：

- `compatible-remote`
- `compatible-bundled`

## 11. Example: recharts

### 11.1 Today

`recharts` 常常因为 current governance + execution mapping 过于保守，而被打回：

- `runtime-only`

### 11.2 With The New Model

如果满足：

- 显式版本存在
- browser-safe
- import-map target 可解析
- artifact shell 可稳定生成
- 平台缓存/CDN 已可提供 external bundle

则它应优先进入：

- `compatible-artifact`

而不是保守掉到：

- `runtime-only`

在交付层上，`recharts` 的推荐演进顺序是：

1. `compatible-remote`
2. `compatible-bundled`
3. 若长期高频且收益明确，再评估是否提升为 `managed-provider`

## 12. Rollout Plan

### Phase 1

- 保持 governance spec 不变为唯一边界
- 新增 execution strategy heuristic 层
- 不替换现有规则，只补自动决策能力

### Phase 2

- 让更多 `soft-allowed` browser-safe 包进入 compatible lane
- 不再默认直接掉入 runtime-only

### Phase 3

- 引入平台控制的 compatible external cache / CDN
- import map 指向平台 URL，而不是直接指向 `esm.sh`

### Phase 3.5

- 对高 fan-out 的 compatible externals 引入 `compatible-bundled`
- 平台将兼容依赖重新收敛成单文件或少量 chunk 再分发
- 优先覆盖 `recharts`、部分 `@radix-ui/*`、部分 `@base-ui/*`

### Phase 4

- 基于使用频率与收益，将高价值 compatible 包提升到 `managed-provider`

## 13. Risks

### 13.1 Complexity Must Not Become Approval

复杂度系统不能成为绕过治理层的自动放行器。

### 13.2 Platform Cache Must Stay Observable

如果做了平台缓存/CDN，就必须让它可观测：

- 命中率
- 拉取失败
- 内容哈希
- 来源 URL

### 13.3 Too Many Managed Promotions Will Still Be Heavy

即使有新执行层，平台也不应把太多依赖轻易提升为 `managed-provider`。

## 14. Success Criteria

成功的标志不是“支持更多包”，而是：

- 更少组件掉入 `runtime-only`
- compatible artifact 比例提升
- compatible 首次加载变快
- 对 `esm.sh` 冷拉的依赖降低

## 15. One-Sentence Summary

平台后续不应再只靠白名单决定 preview 命运，而应演进到：

- **治理层定边界**
- **执行层按复杂度与平台交付能力自动选策略**
- **compatible 依赖逐步从 `esm.sh` 冷拉迁到平台控制缓存/CDN**

## 16. Related Docs

- [Preview Third-Party Dependency Governance Spec](./preview-third-party-dependency-governance-spec.md)
- [Preview Dependency Provider Refactor Spec](./preview-dependency-provider-refactor-spec.md)
- [Soft-Allowed Compatible Artifact Spec](./soft-allowed-compatible-artifact-spec.md)
- [Preview Delivery And CDN Plan](./preview-delivery-and-cdn-plan.md)
- [Preview Artifact Capability Model Spec](./preview-artifact-capability-model-spec.md)

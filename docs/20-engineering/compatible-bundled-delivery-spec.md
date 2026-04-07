Status: proposed
Owner: engineering
Last updated: 2026-04-07
Source of truth: yes

# Compatible Bundled Delivery Spec

本文定义 `compatible-bundled` 的具体实现草案。

目标是让一部分仍属于 `compatible-external` 的依赖，不再以“浏览器直接从 `esm.sh` 拉取多个 ESM module”的方式交付，而是由平台先收敛成单文件或少量 chunk，再通过平台控制的缓存/CDN 分发。

它解决的问题不是“把更多依赖升级成 fully managed”，而是：

- 保持 compatible 语义
- 降低首次加载时的请求 fan-out
- 提升 `compatible-artifact` 的真实体感

## 1. Problem Statement

当前 `compatible-artifact` 的主要剩余瓶颈是：

- artifact shell 已经 ready
- 但 compatible externals 仍多通过 import map 指向 `esm.sh`
- 浏览器打开 preview 时还要发出多个额外请求

典型问题：

- `recharts`
- 部分 `@radix-ui/*`
- 部分 `@base-ui/*`

这些包并不一定需要立即升级为 `managed-provider`，但也不应长期停留在“很多外部模块运行时现拉”的状态。

## 2. Decision

平台正式支持一种新的 compatible 交付形态：

- `compatible-bundled`

其语义为：

- 依赖仍属于 `compatible-external`
- 依赖治理等级不变
- 平台不把它提升为 fully managed provider
- 但平台会为其生成一个可缓存、可复用的交付 bundle

## 3. Non-Goals (v1)

以下不属于第一阶段：

- 完整自建 npm registry
- 对所有 compatible externals 自动 rebundle
- 多 chunk code splitting 的极致优化
- 对所有 transitive 依赖提供 fully reproducible provider-level guarantee

## 4. When A Dependency Qualifies

一个 compatible external 进入 `compatible-bundled` 的前提建议为：

1. governance 已允许
2. 有显式版本
3. browser-safe
4. import-map target 已确定
5. 适合作为浏览器可运行 bundle 输入
6. 请求 fan-out 或冷启动成本明显

典型候选：

- `recharts`
- 高频 `@radix-ui/*`
- 高频 `@base-ui/*`

## 5. Delivery Modes

### 5.1 compatible-remote

- import map 直接指向远端兼容源
- 当前通常是 `esm.sh`

### 5.2 compatible-bundled

- 平台先获取 compatible external 的浏览器可运行入口
- 再次打包/收敛为单文件或少量 chunk
- 存到平台对象存储
- 通过平台控制的 public URL / CDN 域名分发

## 6. Input Contract

`compatible-bundled` 的构建输入建议至少包含：

- package name
- exact version
- importMapTarget
- source URL
- runtime external policy
- React external policy
- bundler mode

推荐结构化描述：

```json
{
  "packageName": "recharts",
  "version": "2.15.1",
  "importMapTarget": "recharts@2.15.1",
  "sourceUrl": "https://esm.sh/recharts@2.15.1?external=react,react-dom,react-dom/client&bundle",
  "deliveryMode": "compatible-bundled"
}
```

## 7. Source Of Bundle

第一阶段最现实的实现不是直接从 npm source 重新求值，而是：

1. 由平台确定 compatible external 的 canonical source URL
2. 从该 canonical source 拉取浏览器可运行产物
3. 再在平台侧做收敛/缓存/分发

这意味着：

- 第一阶段可以继续借助 `esm.sh` 作为上游来源
- 但浏览器端不再直接依赖它

## 8. Rebundle Timing

推荐按以下时机执行：

### 8.1 On-Demand First Fetch

第一次某个 compatible external 被 artifact 需要时：

- 平台先查本地 delivery cache
- 若未命中，则生成 compatible bundle

### 8.2 Background Warm

一旦某个依赖被识别为高频：

- 可在后台预热
- 避免后续组件首次命中时再次等待

### 8.3 Optional Promotion Trigger

若某个兼容依赖被非常高频使用，可进一步作为 future candidate：

- 提升为 `managed-provider`

## 9. Bundle Cache Key

`compatible-bundled` 的缓存 key 至少应包含：

- package name
- exact version
- source URL hash
- bundler mode
- React external policy

推荐逻辑 key：

```text
compatible-bundle:<packageName>:<version>:<contentHash>:<reactPolicy>
```

这样可以保证：

- 同一包同一版本复用
- 上游内容变化可感知
- 不同 external policy 不会混用同一 bundle

## 10. Stored Artifacts

建议至少存：

- bundled JS file
- optional metadata json

metadata 示例：

```json
{
  "packageName": "recharts",
  "version": "2.15.1",
  "deliveryMode": "compatible-bundled",
  "sourceUrl": "https://esm.sh/recharts@2.15.1?...",
  "contentHash": "sha256:...",
  "publicUrl": "https://preview-assets.example.com/npm/recharts/2.15.1/bundle.mjs",
  "createdAt": "2026-04-07T12:34:56Z"
}
```

## 11. Import Map Behavior

### 11.1 Current

当前 compatible remote 常常是：

```json
{
  "imports": {
    "recharts": "https://esm.sh/recharts?external=react,react-dom,react-dom/client&bundle"
  }
}
```

### 11.2 After compatible-bundled

变成：

```json
{
  "imports": {
    "recharts": "https://preview-assets.example.com/npm/recharts/2.15.1/bundle.mjs"
  }
}
```

也就是说：

- artifact HTML 仍然保留 import map contract
- 但 import map 指向的平台控制 URL，而不是第三方冷源

## 12. Relationship To Artifact Capability

`compatible-bundled` 不是新的治理等级，也不是新的 `artifactCapability`。

它是：

- `compatible-artifact` 的一种更优 delivery mode

因此：

- `artifactCapability` 仍然是 `compatible-artifact`
- `artifactStatus` 仍然可为 `ready`
- 只是 runtime delivery 从 `compatible-remote` 升级到了 `compatible-bundled`

## 13. Why This Is Better Than Immediate Managed Promotion

直接把所有高 fan-out compatible externals 提升为 `managed-provider` 会带来更重的平台负担：

- 更高 provider 维护成本
- 更严格的可复现性责任
- 更复杂的升级策略

`compatible-bundled` 的价值在于：

- 先优化交付成本
- 不立即升级治理承诺

## 14. Risks

### 14.1 Upstream Coupling Still Exists

如果第一阶段仍以 `esm.sh` 作为 source URL 上游，则：

- 构建来源仍部分依赖外部源

但浏览器端已经不再直接依赖它。

### 14.2 Cache Invalidation Must Be Explicit

若 source URL / content hash 变化，必须显式失效旧 compatible bundle。

### 14.3 Too Aggressive Rebundling Can Add Worker Cost

不是所有 compatible externals 都值得 rebundle。

第一阶段应优先挑：

- 高 fan-out
- 高频访问
- 浏览器友好

## 15. Recommended Rollout

### Phase 1

- 为 compatible externals 增加 delivery mode 元数据
- 区分 `compatible-remote` 和 `compatible-bundled`

### Phase 2

- 引入 on-demand compatible rebundle cache
- import map 改为优先使用平台 bundle URL

### Phase 3

- 对 `recharts` 做首个试点
- 观察请求数、首屏时间、缓存命中

### Phase 4

- 扩展到部分 `@radix-ui/*` / `@base-ui/*`
- 再评估哪些包应进一步提升为 `managed-provider`

## 16. Suggested Success Metrics

- average external request count per compatible preview
- compatible preview first-contentful time
- compatible bundle cache hit rate
- compatible bundle build success rate
- top compatible packages by fan-out saved

## 17. One-Sentence Summary

`compatible-bundled` 的意义是：

- 不改变 compatible 语义
- 但把“运行时很多外部模块请求”优化成“平台控制的少量 bundle 交付”

## 18. Related Docs

- [Dependency Execution Strategy Heuristic Spec](./dependency-execution-strategy-heuristic-spec.md)
- [Preview Delivery And CDN Plan](./preview-delivery-and-cdn-plan.md)
- [Preview Dependency Provider Refactor Spec](./preview-dependency-provider-refactor-spec.md)
- [Preview Third-Party Dependency Governance Spec](./preview-third-party-dependency-governance-spec.md)

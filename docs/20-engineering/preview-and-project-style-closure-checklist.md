Status: active
Owner: engineering
Last updated: 2026-04-09
Source of truth: partial

# Preview Build And Project Style Closure Checklist

本文档不是新的架构 spec，而是两条主线的**收尾清单**：

1. preview 构建动态决策
2. project 样式 / theme layers context

用于帮助后续 agent 判断：

- 哪些点已经收住
- 哪些点仍是阶段性桥接
- 哪些点是下一步最该补的 closing work

---

## 1. Preview Build Dynamic Decision

### 1.1 已经收住的点

- 第三方依赖治理已正式分层：
  - `tier`
  - `previewCapability`
  - `providerMode`
  - `artifactCapability`
- `soft-allowed + explicit version` 已能进入 `compatible-artifact`
- artifact capability 已是正式三元模型：
  - `managed-artifact`
  - `compatible-artifact`
  - `runtime-only`
- compatible delivery 已细分为：
  - `compatible-remote`
  - `compatible-bundled`

### 1.2 仍属过渡态的点

- preview dependency provider 仍保留 `host-fallback` 作为显式 bridge
- 少量 build / smoke 场景仍可在显式开关下利用 host `node_modules`
- `next.config.ts` 仍保留 trusted preview package tracing bridge

### 1.3 下一步收口项

1. **让 provider 成为真正的一等供应边界**
   - 默认不要把 host node paths 注入所有构建
   - host fallback 仅在显式 diagnostics / bridge 开关下启用

2. **逐步移除 host tracing 作为 correctness 依赖**
   - `next.config.ts` 中的 trusted package tracing 继续视为 temporary bridge
   - deployment correctness 最终应来自 provider-owned assets / runtime plan

3. **把 smoke 的“成功条件”进一步对齐 provider contract**
   - 对 `compatible-external` 不再默认要求 Node 侧真实 `require()`
   - 让 smoke 验证平台 contract，而不是宿主环境偶然状态

4. **继续扩大 `compatible-bundled` 覆盖面**
   - 优先覆盖高频 browser-safe compatible deps
   - `recharts` 已完成首个真实 rollout 验证
   - 继续减少 `esm.sh` 冷拉瓶颈

### 1.4 收口完成的判断标准

- 构建是否成功不再主要依赖宿主 app 是否安装某个 trusted 包
- provider diagnostics 可以单独解释依赖从哪里来
- host tracing 不再被当成长期主路径
- compatible mode 的首屏性能不再主要受 `esm.sh` fan-out 限制

### 1.5 2026-04-09 验证结果

- provider 默认已切到 provider-first；host fallback 需要显式开启 `COZY_ENABLE_PREVIEW_HOST_FALLBACK=true`
- provider 不再会在 host fallback 关闭时偷偷 seed provider cache
- status / manifest 已能显示：
  - `hostFallbackUsed`
  - `managedProviderDependencies`
  - `compatibleBundledDependencies`
- `recharts@3.8.1` 已在真实环境中完成一次 `compatible-bundled` materialization，并在 `pie-chart@0.1.4 (story=donut)` 上验证命中
- 因此本主线已从“机制存在”推进到“provider 边界收紧 + 首个高频 compatible 包真实跑通”

---

## 2. Project Style / Theme Layers Context

### 2.1 已经收住的点

- project default theme 与 resource-level theme relationship 已形成统一 helper
- 系统已明确朝 ordered theme layers 模型演进：
  1. `project.defaultThemeResourceRefs`
  2. `resource.meta.themeResourceRefs`
  3. append + de-dupe + preserve order
- preview route、artifact worker、status API 已共享同一套 theme resolution contract
- artifact worker 已能把 resolved theme CSS 带入 `preview.html`
- UI 已能显示 resolved theme relationship，后续会进一步升级到 layer 级别展示

### 2.2 仍属过渡态的点

- install protocol 尚未正式消费 project-level resolved theme layers relationship
- theme 更新后的 artifact freshness / invalidation 还未完全收口
- 一部分历史组件仍隐式依赖宿主 `App.css` / `globals.css`
- 主实现仍有单值 theme 字段残留，尚未完全切到数组层模型

### 2.3 下一步收口项

1. **让 install protocol 正式理解 resolved theme layers context**
   - 至少能在 install diagnostics 中反映 ordered theme layers
   - install surfaces 应像 shadcn / jsrepo 那样，把 theme layers 作为显式 design-context dependencies 展示
   - 后续决定是“自动带 theme layers”还是“提示用户带 theme layers”

2. **定义 theme freshness / invalidation contract**
   - artifact identity / freshness check 要明确包含 resolved theme layers 输入
   - theme layer 更新后，相关 preview artifact 应可准确失效或重建

3. **继续推动 host-global CSS -> `registry:theme` 迁移**
   - 宿主 `App.css` / `globals.css` 不作为正式 style source
   - 提示用户把共享变量迁到 `registry:theme`

4. **补齐 Tailwind + external theme layers 在 artifact-first 主路径上的一致性**
   - plain co-located CSS 已基本成立
   - Tailwind utility-only + external theme 仍需 artifact-safe delivery 方案

### 2.4 收口完成的判断标准

- preview / artifact / install / docs 对 resolved theme layers 说的是同一种话
- theme 更新后不会长期展示旧主题 artifact
- project theme 不再只在 UI 上“看起来存在”，而是所有主链路都消费同一 source of truth
- 宿主全局 CSS 不再是隐式必要上下文

---

## 3. Recommended Priority

如果要按先后顺序继续收尾，建议：

1. preview provider / host fallback 收口
2. compatible-bundled 扩覆盖
3. install protocol 接 project theme layers context
4. theme freshness / invalidation

---

## 4. References

- [Preview Third-Party Dependency Governance Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/preview-third-party-dependency-governance-spec.md)
- [Preview Dependency Provider Refactor Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/preview-dependency-provider-refactor-spec.md)
- [Compatible Bundled Delivery Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/compatible-bundled-delivery-spec.md)
- [Project Resource Relationship Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-resource-relationship-spec.md)
- [Component Style Organization Model Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/component-style-organization-model-spec.md)
- [Preview And Starter Known Issues Retrospective](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/preview-and-starter-known-issues-retrospective.md)

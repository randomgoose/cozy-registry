Status: proposed
Owner: engineering
Last updated: 2026-04-07
Source of truth: yes

# Preview Delivery And CDN Plan

本文记录 Cozy Registry 当前 preview 产物分发链路的现状、已经具备的 CDN / 对象存储能力、当前瓶颈，以及后续可继续推进的优化方向。

目标不是重新定义 preview artifact 架构，而是把“分发与初次加载速度”这条线单独抽出来管理。

## 1. Problem Statement

当前 preview 首次加载速度已经比早期“请求时动态装配”明显改善，但仍存在两个现实问题：

1. preview artifact 虽然已经静态化，但其公开 URL 与缓存路径还没有完全按“边缘分发优先”优化到位
2. compatible mode 下的第三方依赖仍会带来额外 runtime 请求，成为初次加载的主要剩余瓶颈

因此需要把以下问题单独梳理：

- 当前 preview 是否已经在使用 CDN / 对象存储
- 哪些资源已经走静态分发
- 哪些资源仍然依赖请求时拼装或外部 CDN
- 下一步最值得投入的优化点是什么

## 2. Current State

### 2.1 已经静态化的 preview artifact

当前 artifact build 已经会产出并上传：

- `preview.js`
- `preview.css`
- `manifest.json`
- `preview.html`

相关实现：

- [lib/preview-artifact-jobs.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-artifact-jobs.ts)
- [lib/preview-artifact-html.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-artifact-html.ts)

### 2.2 公开对象存储已在使用

artifact 通过公开对象存储 URL 提供给客户端。当前存储层支持：

- Supabase Storage
- S3-compatible / R2

相关实现：

- [lib/storage.ts](/Users/chenchen/Documents/GitHub/my-app/lib/storage.ts)

artifact 上传后会返回公开 URL，例如：

- `jsUrl`
- `cssUrl`
- `htmlUrl`

这些 URL 会写回数据库供 preview route 使用。

### 2.3 长缓存策略已存在

当前 artifact 上传已经使用长缓存，例如：

- `cacheControl: "31536000"`

这说明 preview artifact 从缓存策略上已经适合放在 CDN 前面做边缘分发。

### 2.4 preview route 已具备 artifact fast path

当前 preview route 在命中 ready artifact 时，会优先：

- 读取 `htmlContent`
- 或拉取 `htmlUrl`

并直接返回完整 preview HTML，而不是再走 legacy dynamic assembly。

相关实现：

- [app/preview/[owner]/[name]/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/preview/[owner]/[name]/route.ts)

### 2.5 外部依赖当前主要仍走 esm.sh

当前 compatible externals 与部分 React runtime 仍大量使用：

- `https://esm.sh/...`

相关实现：

- [lib/preview-artifact-html.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-artifact-html.ts)
- [app/preview/[owner]/[name]/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/preview/[owner]/[name]/route.ts)

在 bundledReact=false 或 compatible externals 仍为 runtime external 时，HTML 中会包含：

- `importmap`
- `preconnect`
- `modulepreload`

这对稳定性和首屏有帮助，但请求数仍高于 fully bundled artifact。

## 3. Current Strengths

### 3.1 preview 已从“请求时拼页面”转向“构建后分发产物”

这是当前最大的性能收益来源。

### 3.2 artifact 自带缓存友好 URL

只要对象存储前面有合适的 CDN，`preview.html` / `preview.js` / `preview.css` 天然适合走边缘缓存。

### 3.3 route 已经支持 artifact-first

这意味着首屏越来越接近“静态页面加载”，而不是“动态拼装页面”。

## 4. Current Bottlenecks

### 4.1 公开对象存储 URL 不等于最佳 CDN 分发

当前系统已经有公开对象存储 URL，但这不自动等于：

- 自定义 CDN 域名
- 边缘缓存策略最优
- 最低 TTFB

如果仍直接使用对象存储 public URL，性能会比挂真正 CDN 稍差。

### 4.2 compatible mode 下的外部依赖请求数仍偏多

当前 artifact 即使 ready，也可能还需要浏览器额外请求：

- React runtime
- `compatibleExternals`
- 由 import map 指向的 `esm.sh` 资源

因此很多情况下，真正限制首屏速度的已经不是 `preview.js`，而是：

- runtime external dependency fan-out

### 4.3 route 仍保留部分 legacy dynamic assembly 逻辑

虽然 main path 已偏 artifact-first，但 fallback / compatibility 路径仍有 request-time 装配色彩。

### 4.4 self-hosted React 仍是可选分支，不是统一默认

当前 `lib/preview-artifact-html.ts` 已支持 self-hosted React base URL，但这还是开关式能力，不是统一收敛后的正式交付模式。

## 5. What Is Already Using CDN-Like Delivery

可以明确认为已经具备 CDN / 静态分发基础的内容：

- artifact 文件本身（`preview.js` / `preview.css` / `manifest.json` / `preview.html`）
- 长缓存头
- public URL
- route-level artifact fast path

但以下内容仍属于“外部依赖型 CDN”而不是平台自有分发：

- `esm.sh` 上的 React runtime
- `esm.sh` 上的 compatible externals

## 6. Near-Term Opportunities

### 6.1 给 preview artifact 挂真正的 CDN 域名

最直接、最配置型的优化。

目标：

- `preview.html`
- `preview.js`
- `preview.css`
- `manifest.json`

都通过稳定 CDN 域名提供，而不是裸对象存储 URL。

收益：

- 更低 TTFB
- 更稳定的边缘缓存
- 更可控的缓存策略与域名层观测

### 6.2 提高 artifact hit 率

CDN 只有在 artifact 已 ready 且可命中时才真正带来收益。

重点继续提升：

- default story 预热
- thumbnail 预热
- 多 story artifact coverage
- theme / story / capability lane 的稳定命中

### 6.3 做更积极的 preload / preconnect

在用户即将打开 preview 时，前端可基于用户意图预加载：

- `preview.html`
- `preview.js`
- 相关 story artifact URL

适用场景：

- hover component card
- hover story tab
- 即将展开 preview 面板

## 7. Medium-Term Opportunities

### 7.1 继续减少 compatible mode 对 esm.sh 的依赖

这是当前最重要的性能剩余瓶颈。

目标：

- 更多依赖进入 `managed-provider`
- 或至少进入更稳定的 `compatible-artifact` delivery plan

这里应明确区分两种 compatible 交付：

1. `compatible-remote`
   - import map 直接指向 `esm.sh` 或等价远端源

2. `compatible-bundled`
   - 平台先把 compatible external 依赖重新打成一个交付 bundle
   - 再通过平台自有缓存/CDN 分发

`compatible-bundled` 的价值在于：

- 保持 compatible 语义
- 不要求立刻升级成 fully managed provider
- 但能显著减少外部依赖的请求 fan-out

### 7.2 用 provider-owned delivery 替代 host + external 混合模式

长期不应继续依赖：

- 宿主 app 的 `node_modules`
- `next.config.ts` tracing

而应转向：

- provider-owned dependency assets
- provider-generated runtime plan

### 7.3 self-hosted React 统一化

现在 self-hosted React 已经是可选能力。中期可以评估是否把 React runtime 统一收敛到：

- 平台自有静态分发路径

而不是一部分走 `esm.sh`，一部分走自托管分支。

## 8. Long-Term Direction

长期最佳形态是：

### 8.1 Managed artifact

- `preview.html`
- `preview.js`
- `preview.css`
- runtime 依赖尽量已内联或由平台自有 provider 提供

### 8.2 Compatible artifact

- artifact shell 仍是平台自有静态文件
- 少量 external 依赖由平台明确 runtime contract 提供
- 不再依赖临时、分散、不可观测的请求时拼装

长期 compatible artifact 的优先级应是：

1. `compatible-bundled`
2. `compatible-remote`

也就是说，compatible mode 不应长期被理解成“必然从 `esm.sh` 现拉很多模块”，而应逐步升级成平台控制的兼容交付层。

### 8.3 Route as thin controller

`/preview/...` 的长期职责应收敛为：

- 状态判断
- access / visibility boundary
- ready artifact 入口分发

而不是主装配器。

## 9. Recommendations By Priority

### P0

- 提高 artifact hit 率
- 确保 default story / thumbnail / 多 story 能稳定预热

### P1

- 给 preview artifact 使用真正 CDN 域名
- 做前端 intent-based preload

### P2

- 继续减少 `esm.sh` 请求数
- 让更多 compatible case 进入更完整的 artifact delivery

### P3

- self-hosted React 统一收敛
- provider-owned dependency delivery 成熟化

## 10. Operational Questions

以下问题需要后续设计与运维一起确认：

1. 当前 public artifact URL 是否已在真正 CDN 域名后面
2. CDN 是否支持按内容哈希长期缓存
3. `htmlUrl` / `jsUrl` / `cssUrl` 是否需要统一域名和缓存可观测性
4. 是否为 preview 资源单独做 CDN 日志与命中率看板

## 11. Success Metrics

建议后续跟踪：

- ready artifact 命中率
- preview 首屏 TTFB
- compatible artifact 首次可见时间
- average `esm.sh` request count per preview
- preview HTML / JS cache hit ratio

## 12. One-Sentence Summary

当前系统已经具备“artifact + public storage + cache headers”的 CDN 基础，但真正限制初次加载速度的剩余问题，越来越集中在：

- 对象存储 URL 是否通过真正 CDN 分发
- compatible mode 下 external 依赖请求数仍偏高

## 13. Related Docs

- [Preview Artifact Retrospective](./preview-artifact-retrospective.md)
- [Preview Dependency Provider Refactor Spec](./preview-dependency-provider-refactor-spec.md)
- [Preview Third-Party Dependency Governance Spec](./preview-third-party-dependency-governance-spec.md)
- [Preview Artifact Capability Model Spec](./preview-artifact-capability-model-spec.md)
- [Story Preview UX / Performance Spec](./story-preview-ux-performance-spec.md)

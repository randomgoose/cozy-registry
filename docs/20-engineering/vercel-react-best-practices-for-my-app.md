Status: proposed
Owner: engineering
Last updated: 2026-04-07
Source of truth: no

# Vercel React Best Practices For My App

本文将 [vercel-react-best-practices](/Users/chenchen/Documents/GitHub/my-app/.agents/skills/vercel-react-best-practices/SKILL.md) 中最适合当前仓库的规则，映射到 Cozy Registry 的具体文件和改动方向。

目标不是覆盖全部 40+ 条规则，而是提炼出对当前问题最有帮助的 10 条：

- preview request-time 装配仍偏重
- 后台页面切换慢
- client 面板重复请求多
- preview/detail 交互还可以更顺

## 1. async-parallel / server-parallel-fetching

### Why it matters here

当前不少服务器端链路仍存在串行读取：

- layout / page 重复查同一份上下文
- preview route 请求时做过多顺序装配

### Best targets

- [app/preview/[owner]/[name]/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/preview/[owner]/[name]/route.ts)
- [app/(auth)/layout.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/layout.tsx)
- [app/(auth)/workspace/[slug]/layout.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/workspace/[slug]/layout.tsx)
- [app/(auth)/workspace/[slug]/page.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/workspace/[slug]/page.tsx)

### Recommended action

- 把互不依赖的读取前置为并行 promise
- 减少 layout/page 间重复读取
- 继续把 preview route 压成 thin controller

## 2. server-cache-react / per-request dedup

### Why it matters here

同一请求内，对 item、project、workspace、theme 的重复读取会放大延迟。

### Best targets

- [app/preview/[owner]/[name]/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/preview/[owner]/[name]/route.ts)
- [app/api/registry/preview-artifacts/status/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/api/registry/preview-artifacts/status/route.ts)
- [lib/workspace-context.ts](/Users/chenchen/Documents/GitHub/my-app/lib/workspace-context.ts)

### Recommended action

- 为单请求内重复读取做 dedup
- 清理“同一响应链路查同一资源多次”的路径

## 3. rerender-move-effect-to-event

### Why it matters here

后台页面切换慢的一个重要来源，是页面挂载后 effect 再去补动作并 refresh。

### Best targets

- [app/(auth)/workspace/[slug]/WorkspaceScopeSync.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/workspace/[slug]/WorkspaceScopeSync.tsx)
- [app/(auth)/me/PersonalScopeSync.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/me/PersonalScopeSync.tsx)

### Recommended action

- 优先把 scope 切换移动到用户动作里
- 页面级 sync 只保留兜底
- 减少 mount-time `router.refresh()`

## 4. rerender-transitions

### Why it matters here

story 切换、scope 切换、preview panel 切换都属于非紧急 UI 更新。

### Best targets

- [app/components/WorkspaceScopeSwitcher.tsx](/Users/chenchen/Documents/GitHub/my-app/app/components/WorkspaceScopeSwitcher.tsx)
- [app/registry/[owner]/[name]/ComponentDetail.tsx](/Users/chenchen/Documents/GitHub/my-app/app/registry/[owner]/[name]/ComponentDetail.tsx)
- [app/components/PreviewFrame.tsx](/Users/chenchen/Documents/GitHub/my-app/app/components/PreviewFrame.tsx)

### Recommended action

- 对非紧急切换继续使用 `startTransition`
- 优先应用在 story 切换、preview 面板切换、详情页重型状态更新

## 5. rerender-use-deferred-value

### Why it matters here

搜索 / 过滤类界面很适合把输入流畅度和重计算分开。

### Best targets

- [app/components/RegistryBrowser.tsx](/Users/chenchen/Documents/GitHub/my-app/app/components/RegistryBrowser.tsx)

### Recommended action

- 继续把 `RegistryBrowser` 当成样板
- 后续 story search / docs search / 大筛选面板复用此模式

## 6. client-swr-dedup

### Why it matters here

当前不少 client 面板直接用 `fetch(..., { cache: "no-store" })`，容易重复请求和状态抖动。

### Best targets

- [app/(auth)/dashboard/CollectionsPanel.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/dashboard/CollectionsPanel.tsx)
- [app/components/ComponentCard.tsx](/Users/chenchen/Documents/GitHub/my-app/app/components/ComponentCard.tsx)
- [app/(auth)/settings/settings-page-client.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/settings/settings-page-client.tsx)

### Recommended action

- 抽统一 client data layer
- 做请求 dedup 和统一 cache key
- 不一定必须引入 SWR，但要具备同类能力

## 7. bundle-dynamic-imports

### Why it matters here

重型 preview/detail/dashboard 组件不应全部落进首屏 client bundle。

### Best targets

- [app/(auth)/dashboard/CollectionsPanel.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/dashboard/CollectionsPanel.tsx)
- [app/components/ComponentCard.tsx](/Users/chenchen/Documents/GitHub/my-app/app/components/ComponentCard.tsx)
- [app/registry/[owner]/[name]/ComponentDetail.tsx](/Users/chenchen/Documents/GitHub/my-app/app/registry/[owner]/[name]/ComponentDetail.tsx)

### Recommended action

- 对展开态、大 preview UI、非首屏面板做 dynamic import
- 优先减轻列表页和详情页的初始 bundle

## 8. bundle-defer-third-party

### Why it matters here

preview runtime 的目标是先快出来，非关键增强逻辑可以后置。

### Best targets

- [app/preview/[owner]/[name]/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/preview/[owner]/[name]/route.ts)
- [lib/preview-artifact-html.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-artifact-html.ts)
- [lib/preview-dependency-provider.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-dependency-provider.ts)

### Recommended action

- 优先保证 preview shell 快速可见
- 把非关键调试/增强 runtime 放到后面加载

## 9. async-suspense-boundaries

### Why it matters here

组件详情页和后台壳层不应该为了少数重型内容阻塞整页首屏。

### Best targets

- [app/registry/[owner]/[name]/page.tsx](/Users/chenchen/Documents/GitHub/my-app/app/registry/[owner]/[name]/page.tsx)
- [app/registry/[owner]/[name]/ComponentDetail.tsx](/Users/chenchen/Documents/GitHub/my-app/app/registry/[owner]/[name]/ComponentDetail.tsx)
- [app/(auth)/layout.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/layout.tsx)

### Recommended action

- 把 metadata / body / preview / diagnostics 分层显示
- 避免“一起等完再渲染”

## 10. bundle-preload / intent-based preload

### Why it matters here

artifact-first 路线特别适合基于用户意图做预加载。

### Best targets

- [app/components/ComponentCard.tsx](/Users/chenchen/Documents/GitHub/my-app/app/components/ComponentCard.tsx)
- [app/components/PreviewFrame.tsx](/Users/chenchen/Documents/GitHub/my-app/app/components/PreviewFrame.tsx)
- [app/registry/[owner]/[name]/ComponentDetail.tsx](/Users/chenchen/Documents/GitHub/my-app/app/registry/[owner]/[name]/ComponentDetail.tsx)

### Recommended action

- hover card / hover story tab / 即将展开 preview 时预加载 artifact URL
- 提高 preview 切换和详情展开的感知速度

## 11. Suggested Agent Breakdown

### Agent 1: Dashboard Data Flow

关注：

- `async-parallel`
- `server-cache-react`
- `client-swr-dedup`
- `rerender-move-effect-to-event`

目标：

- 后台切页更快
- client 面板减少重复 fetch

### Agent 2: Preview / Detail Interaction

关注：

- `rerender-transitions`
- `async-suspense-boundaries`
- `bundle-preload`

目标：

- preview/detail 切换更平滑
- story 切换和详情首屏更顺

### Agent 3: Bundle / Shell Optimization

关注：

- `bundle-dynamic-imports`
- `bundle-defer-third-party`
- `server-parallel-fetching`

目标：

- 更轻的首屏 bundle
- 更薄的 preview shell

## 12. Top 5 Immediate Actions

1. 清理 [WorkspaceScopeSync.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/workspace/[slug]/WorkspaceScopeSync.tsx) 与 [PersonalScopeSync.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/me/PersonalScopeSync.tsx) 的 mount-time refresh
2. 合并 [workspace/[slug]/layout.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/workspace/[slug]/layout.tsx) 与 [workspace/[slug]/page.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/workspace/[slug]/page.tsx) 的重复读取
3. 给 [CollectionsPanel.tsx](/Users/chenchen/Documents/GitHub/my-app/app/(auth)/dashboard/CollectionsPanel.tsx) 建统一 client data layer
4. 给 [ComponentDetail.tsx](/Users/chenchen/Documents/GitHub/my-app/app/registry/[owner]/[name]/ComponentDetail.tsx) 的 preview / story 切换加 `startTransition` 与 preload
5. 继续把 [route.ts](/Users/chenchen/Documents/GitHub/my-app/app/preview/[owner]/[name]/route.ts) 压成 thin controller

## 13. Related Docs

- [Dashboard Navigation Performance Plan](./dashboard-navigation-performance-plan.md)
- [Preview Artifact Retrospective](./preview-artifact-retrospective.md)
- [Story Preview UX / Performance Spec](./story-preview-ux-performance-spec.md)
- [Multi-Story Preview Page Spec](./multi-story-preview-page-spec.md)
